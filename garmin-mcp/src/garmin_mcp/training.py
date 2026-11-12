"""Validated Garmin workout creation and calendar scheduling.

Numeric types are verified against Garmin's /workout-service/workout/types;
0.2.40's model constants contain incorrect sport and heart-rate target IDs.
No arbitrary endpoints or raw upload payloads are exposed to the health agent.
"""

import hashlib
import json
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

SPORTS = {"running": 1, "cycling": 2, "strength_training": 5, "cardio_training": 6,
          "yoga": 7, "pilates": 8, "hiit": 9, "mobility": 11, "other": 3}
STEP_TYPES = {"warmup": 1, "cooldown": 2, "interval": 3, "recovery": 4, "rest": 5}
CREATE_WORKOUT_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["name", "sport", "steps"],
    "properties": {
        "name": {"type": "string", "minLength": 1, "maxLength": 80},
        "sport": {"type": "string", "enum": list(SPORTS)},
        "description": {"type": "string", "maxLength": 500},
        "steps": {"type": "array", "minItems": 1, "maxItems": 50, "items": {
            "type": "object", "additionalProperties": False,
            "required": ["type", "duration_seconds"], "properties": {
                "type": {"type": "string", "enum": list(STEP_TYPES)},
                "duration_seconds": {"type": "integer", "minimum": 1, "maximum": 21600},
                "description": {"type": "string", "maxLength": 200},
                "target_hr_zone": {"type": "integer", "minimum": 1, "maximum": 5},
            },
        }},
    },
}


def positive_id(value):
    if isinstance(value, bool) or not re.fullmatch(r"[1-9]\d{0,17}", str(value)):
        raise ValueError("Invalid workout ID")
    return int(value)


def calendar_month(year, month):
    if type(year) is not int or type(month) is not int or not 2000 <= year <= 2099 or not 1 <= month <= 12:
        raise ValueError("Use year 2000–2099 and month 1–12")
    return f"/calendar-service/year/{year}/month/{month - 1}"


def workout_payload(name, sport, steps, description=""):
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        raise ValueError("Workout name must contain 1–80 characters")
    if sport not in SPORTS:
        raise ValueError("Unsupported Garmin workout sport")
    if not isinstance(description, str) or len(description) > 500:
        raise ValueError("Description must contain at most 500 characters")
    if not isinstance(steps, list) or not 1 <= len(steps) <= 50:
        raise ValueError("Provide 1–50 timed workout steps")
    result, total = [], 0
    for order, step in enumerate(steps, 1):
        if not isinstance(step, dict) or set(step) - {"type", "duration_seconds", "description", "target_hr_zone"}:
            raise ValueError("Invalid workout step fields")
        kind, seconds, zone = step.get("type"), step.get("duration_seconds"), step.get("target_hr_zone")
        if kind not in STEP_TYPES or type(seconds) is not int or not 1 <= seconds <= 21600:
            raise ValueError("Steps require a supported type and 1–21600 seconds")
        if zone is not None and (type(zone) is not int or not 1 <= zone <= 5):
            raise ValueError("Heart rate zone must be 1–5")
        note = step.get("description", "")
        if not isinstance(note, str) or len(note) > 200:
            raise ValueError("Step description must contain at most 200 characters")
        total += seconds
        result.append({
            "type": "ExecutableStepDTO", "stepOrder": order, "description": note,
            "stepType": {"stepTypeId": STEP_TYPES[kind], "stepTypeKey": kind, "displayOrder": STEP_TYPES[kind]},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True},
            "endConditionValue": seconds,
            "targetType": {"workoutTargetTypeId": 4 if zone else 1,
                           "workoutTargetTypeKey": "heart.rate.zone" if zone else "no.target",
                           "displayOrder": 4 if zone else 1},
            **({"zoneNumber": zone} if zone else {}),
        })
    if total > 43200:
        raise ValueError("Workout total cannot exceed 12 hours")
    sport_type = {"sportTypeId": SPORTS[sport], "sportTypeKey": sport, "displayOrder": SPORTS[sport]}
    payload = {"workoutName": name.strip(), "description": description.strip(), "sportType": sport_type,
               "estimatedDurationInSecs": total,
               "workoutSegments": [{"segmentOrder": 1, "sportType": sport_type, "workoutSteps": result}]}
    fingerprint = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
    payload["description"] = (description.strip() + f"\n[healthy:{fingerprint}]").strip()
    return payload


def workout_matches(saved, payload):
    try:
        saved_steps = saved["workoutSegments"][0]["workoutSteps"]
        expected_steps = payload["workoutSegments"][0]["workoutSteps"]
        return (saved.get("sportType", {}).get("sportTypeKey") == payload["sportType"]["sportTypeKey"] and
                len(saved.get("workoutSegments", [])) == 1 and len(saved_steps) == len(expected_steps) and
                all(s.get("endConditionValue") == expected["endConditionValue"] and
                    s.get("endCondition", {}).get("conditionTypeId") == 2 and
                    s.get("stepType", {}).get("stepTypeId") == expected["stepType"]["stepTypeId"] and
                    s.get("targetType", {}).get("workoutTargetTypeId") == expected["targetType"]["workoutTargetTypeId"] and
                    s.get("zoneNumber") == expected.get("zoneNumber")
                    for s, expected in zip(saved_steps, expected_steps)))
    except (KeyError, TypeError, AttributeError, IndexError):
        return False


def create_workout(client, name, sport, steps, description=""):
    payload = workout_payload(name, sport, steps, description)
    # Reuse an identical application-created template across retries and dates.
    # Paginate rather than inspecting only the most recent 100 workouts.
    for start in range(0, 10000, 100):
        rows = client.get_workouts(start=start, limit=100)
        for row in rows:
            if row.get("workoutName") != payload["workoutName"]:
                continue
            existing = client.get_workout_by_id(row["workoutId"])
            if existing.get("description") == payload["description"] and workout_matches(existing, payload):
                return {"workout_id": existing["workoutId"], "name": name.strip(), "reused": True, "verified": True,
                        "duration_seconds": payload["estimatedDurationInSecs"]}
        if len(rows) < 100:
            break
    else:
        raise RuntimeError("Workout library is too large to safely check for duplicate templates")
    uploaded = client.upload_workout(payload)
    workout_id = positive_id(uploaded.get("workoutId"))
    try:
        saved = client.get_workout_by_id(workout_id)
        verified = workout_matches(saved, payload)
    except Exception:
        verified = False
    return {"workout_id": workout_id, "name": name.strip(), "reused": False, "verified": verified,
            "duration_seconds": payload["estimatedDurationInSecs"],
            **({"warning": "Template created; verify its sport, steps and targets with get_workout_by_id before scheduling."} if not verified else {})}


def schedule_workout(client, workout_id, date_str):
    workout_id = positive_id(workout_id)
    if not isinstance(date_str, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_str):
        raise ValueError("Date must use YYYY-MM-DD")
    day = date.fromisoformat(date_str)
    if day < datetime.now(ZoneInfo("Asia/Shanghai")).date():
        raise ValueError("Choose today or a future date for new training")
    path = calendar_month(day.year, day.month)
    calendar = client.connectapi(path)
    for item in calendar.get("calendarItems", []):
        if item.get("itemType") == "workout" and str(item.get("workoutId")) == str(workout_id) and item.get("date") == date_str:
            return {"workout_id": workout_id, "schedule_id": item["id"], "date": date_str,
                    "name": item.get("title"), "verified": True, "already_scheduled": True}
    result = client.schedule_workout(workout_id, date_str)
    schedule_id = positive_id(result.get("workoutScheduleId"))
    # Do not report an uncertain readback as confirmed success, or re-POST after a
    # successful schedule write. The caller can query get_calendar to reconcile.
    try:
        readback = client.get_scheduled_workout_by_id(schedule_id)
        calendar = client.connectapi(path)
        verified = (readback.get("calendarDate") == date_str and
                    str(readback.get("workout", {}).get("workoutId")) == str(workout_id) and
                    any(str(item.get("id")) == str(schedule_id) and item.get("date") == date_str
                        for item in calendar.get("calendarItems", [])))
    except Exception:
        verified = False
    return {"workout_id": workout_id, "schedule_id": schedule_id, "date": date_str,
            "name": result.get("workout", {}).get("workoutName"), "verified": verified,
            "already_scheduled": False,
            **({"warning": "Garmin accepted the schedule; calendar readback is pending. Query get_calendar before retrying."} if not verified else {})}
