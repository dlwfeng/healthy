"""Garmin API client module - wraps garminconnect library"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from garminconnect import Garmin
from garmin_mcp.training import calendar_month, create_workout, schedule_workout
from threading import RLock


class GarminClient:
    """Garmin Connect API client using garminconnect library"""

    def __init__(self):
        config = self._load_config()
        self._email = config.get("email")
        self._password = config.get("password")
        self._is_cn = config.get("domain") == "garmin.cn"
        self._client = None
        self._training_lock = RLock()

    def _load_config(self) -> dict:
        config_path = Path(os.environ.get("GARMIN_CONFIG_PATH", "config/garmin.json")).expanduser()
        if config_path.exists():
            with config_path.open("r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    @property
    def client(self) -> Garmin:
        if self._client is None:
            self._client = Garmin(self._email, self._password, is_cn=self._is_cn)
            self._client.login()
        return self._client

    def _get_date(self, date=None) -> str:
        return date or datetime.now().strftime("%Y-%m-%d")

    def _get_user_id(self):
        profile = self.client.get_user_profile()
        return profile.get('id') if profile else None

    # === User & Profile ===
    def get_full_name(self) -> str:
        return self.client.get_full_name()

    def get_unit_system(self) -> str:
        return self.client.get_unit_system()

    def get_user_profile(self) -> dict:
        return self.client.get_user_profile()

    def get_userprofile_settings(self) -> dict:
        return self.client.get_userprofile_settings()

    def get_user_summary(self, date: str = None) -> dict:
        return self.client.get_user_summary(self._get_date(date))

    # === Daily Health & Activity ===
    def get_daily_steps(self, date: str = None, days: int = 1) -> list:
        date = self._get_date(date)
        start = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=days-1)).strftime("%Y-%m-%d")
        return self.client.get_daily_steps(start, date)

    def get_steps_data(self, date: str = None) -> dict:
        return self.client.get_steps_data(self._get_date(date))

    def get_floors(self, date: str = None) -> dict:
        return self.client.get_floors(self._get_date(date))

    def get_heart_rates(self, date: str = None) -> dict:
        return self.client.get_heart_rates(self._get_date(date))

    def get_rhr_day(self, date: str = None) -> dict:
        return self.client.get_rhr_day(self._get_date(date))

    def get_intensity_minutes(self, date: str = None) -> dict:
        return self.client.get_intensity_minutes_data(self._get_date(date))

    def get_all_day_stress(self, date: str = None) -> list:
        return self.client.get_all_day_stress(self._get_date(date))

    def get_all_day_events(self, date: str = None) -> list:
        return self.client.get_all_day_events(self._get_date(date))

    def get_stats(self, date: str = None) -> dict:
        return self.client.get_stats(self._get_date(date))

    def get_stats_and_body(self, date: str = None) -> dict:
        return self.client.get_stats_and_body(self._get_date(date))

    # === Advanced Health Metrics ===
    def get_max_metrics(self, date: str = None) -> dict:
        return self.client.get_max_metrics(self._get_date(date))

    def get_fitness_age(self, date: str = None) -> dict:
        return self.client.get_fitnessage_data(self._get_date(date))

    def get_weight_goal(self, date: str = None) -> dict:
        day = self._get_date(date)
        return self.client.connectapi(f"/goal-service/goal/user/effective/weightgoal/{day}/{day}")

    def get_cycling_ftp(self) -> dict:
        return self.client.get_cycling_ftp()

    def get_lactate_threshold(self) -> dict:
        return self.client.get_lactate_threshold()

    def get_hrv_data(self, date: str = None) -> dict:
        return self.client.get_hrv_data(self._get_date(date))

    def get_hydration_data(self, date: str = None) -> dict:
        return self.client.get_hydration_data(self._get_date(date))

    # === Historical Data ===
    def get_weekly_steps(self, end_date: str = None, weeks: int = 4) -> list:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        return self.client.get_daily_steps(end, end)

    def get_weekly_stress(self, end_date: str = None, weeks: int = 4) -> list:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        return self.client.get_stress_data(end)

    def get_progress_summary(self, start_date: str = None, end_date: str = None) -> dict:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        return self.client.get_progress_summary_between_dates(start, end)

    # === Sleep & Stress ===
    def get_sleep_data(self, date: str = None) -> dict:
        return self.client.get_sleep_data(self._get_date(date))

    def get_stress_data(self, date: str = None) -> dict:
        return self.client.get_stress_data(self._get_date(date))

    # === Body Battery ===
    def get_body_battery(self, start_date: str = None, end_date: str = None) -> list:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        return self.client.get_body_battery(start, end)

    def get_body_battery_events(self, date: str = None) -> list:
        return self.client.get_body_battery_events(self._get_date(date))

    # === Body Composition ===
    def get_body_composition(self, start_date: str = None, end_date: str = None) -> dict:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        return self.client.get_body_composition(start, end)

    def get_weigh_ins(self, start_date: str = None, end_date: str = None) -> dict:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        return self.client.get_weigh_ins(start, end)

    def get_daily_weigh_ins(self, date: str = None) -> dict:
        return self.client.get_daily_weigh_ins(self._get_date(date))

    def add_weigh_in(self, weight_kg: float, timestamp: str) -> dict:
        """Write one weigh-in to Garmin Connect. timestamp must include an offset."""
        return self.client.add_weigh_in(weight=float(weight_kg), unitKey="kg", timestamp=timestamp)

    # === Health Metrics ===
    def get_respiration_data(self, date: str = None) -> dict:
        return self.client.get_respiration_data(self._get_date(date))

    def get_spo2_data(self, date: str = None) -> dict:
        return self.client.get_spo2_data(self._get_date(date))

    def get_blood_pressure(self, start_date: str = None, end_date: str = None) -> dict:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or end
        return self.client.get_blood_pressure(start, end)

    # === Training ===
    def get_training_status(self, date: str = None) -> dict:
        return self.client.get_training_status(self._get_date(date))

    def get_training_readiness(self, date: str = None) -> dict:
        return self.client.get_training_readiness(self._get_date(date))

    def get_endurance_score(self, start_date: str = None, end_date: str = None) -> dict:
        start = start_date or datetime.now().strftime("%Y-%m-%d")
        end = end_date or start
        return self.client.get_endurance_score(start, end)

    def get_hill_score(self, start_date: str = None, end_date: str = None) -> dict:
        start = start_date or datetime.now().strftime("%Y-%m-%d")
        end = end_date or start
        return self.client.get_hill_score(start, end)

    def get_race_predictions(self, date: str = None) -> dict:
        return self.client.get_race_predictions()

    # === Activities ===
    def get_activities(self, start: int = 0, limit: int = 10) -> list:
        return self.client.get_activities(start, limit)

    def get_activities_by_date(self, start_date: str = None, end_date: str = None, activity_type: str = None) -> list:
        start = start_date or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        return self.client.get_activities_by_date(start, end, activity_type)

    def get_activities_fordate(self, date: str = None) -> list:
        return self.client.get_activities_fordate(self._get_date(date))

    def get_activity(self, activity_id: int) -> dict:
        return self.client.get_activity(activity_id)

    def get_activity_details(self, activity_id: int) -> dict:
        return self.client.get_activity_details(activity_id)

    def get_activity_exercise_sets(self, activity_id: int) -> dict:
        return self.client.get_activity_exercise_sets(activity_id)

    def get_activity_gear(self, activity_id: int) -> dict:
        return self.client.get_activity_gear(activity_id)

    def get_activity_types(self) -> list:
        return self.client.get_activity_types()

    def _get_activity_type_by_key(self, type_key: str) -> dict | None:
        for activity_type in self.get_activity_types():
            if activity_type.get("typeKey") == type_key:
                return activity_type
        return None

    def set_activity_type(self, activity_id: int, type_key: str) -> dict:
        activity_type = self._get_activity_type_by_key(type_key)
        if not activity_type:
            return {"error": f"Unknown activity type: {type_key}"}

        result = self.client.set_activity_type(
            str(activity_id),
            activity_type["typeId"],
            activity_type["typeKey"],
            activity_type["parentTypeId"],
        )
        return {
            "activity_id": activity_id,
            "activity_type": activity_type,
            "result": result,
        }

    def fix_badminton_activity_types(
        self,
        start_date: str = None,
        end_date: str = None,
        name_contains: str = "羽毛球",
        dry_run: bool = True,
    ) -> dict:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        target_type = self._get_activity_type_by_key("badminton")
        if not target_type:
            return {"error": "Garmin activity type 'badminton' is not available"}

        activities = self.get_activities_by_date(start, end)
        result = {
            "dry_run": dry_run,
            "period": {"start_date": start, "end_date": end},
            "target_type": target_type,
            "scanned": len(activities),
            "matched": 0,
            "updated": 0,
            "skipped": 0,
            "activities": [],
            "errors": [],
        }

        for activity in activities:
            activity_id = activity.get("activityId")
            activity_name = activity.get("activityName") or ""
            current_type = activity.get("activityType") or {}
            if name_contains not in activity_name and "badminton" not in activity_name.lower():
                continue

            result["matched"] += 1
            item = {
                "activity_id": activity_id,
                "activity_name": activity_name,
                "start_time_local": activity.get("startTimeLocal"),
                "from_type": current_type,
                "to_type": target_type,
            }

            if current_type.get("typeKey") == "badminton":
                item["status"] = "skipped_already_badminton"
                result["skipped"] += 1
            elif dry_run:
                item["status"] = "dry_run"
                result["skipped"] += 1
            else:
                try:
                    self.client.set_activity_type(
                        str(activity_id),
                        target_type["typeId"],
                        target_type["typeKey"],
                        target_type["parentTypeId"],
                    )
                    item["status"] = "updated"
                    result["updated"] += 1
                except Exception as e:
                    item["status"] = "error"
                    item["error"] = str(e)
                    result["errors"].append(item)

            result["activities"].append(item)

        return result

    def get_activity_weather(self, activity_id: int) -> dict:
        return self.client.get_activity_weather(activity_id)

    def get_activity_splits(self, activity_id: int) -> dict:
        return self.client.get_activity_splits(activity_id)

    def get_activity_split_summaries(self, activity_id: int) -> dict:
        return self.client.get_activity_split_summaries(activity_id)

    def get_activity_typed_splits(self, activity_id: int) -> dict:
        return self.client.get_activity_typed_splits(activity_id)

    def get_activity_hr_in_timezones(self, activity_id: int) -> dict:
        return self.client.get_activity_hr_in_timezones(activity_id)

    def get_last_activity(self) -> dict:
        return self.client.get_last_activity()

    def download_activity(self, activity_id: int, format: str = "gpx") -> str:
        format_map = {
            "gpx": self.client.ActivityDownloadFormat.GPX,
            "tcx": self.client.ActivityDownloadFormat.TCX,
            "fit": self.client.ActivityDownloadFormat.ORIGINAL,
            "kml": self.client.ActivityDownloadFormat.KML,
            "csv": self.client.ActivityDownloadFormat.CSV,
        }
        fmt = format_map.get(format.lower(), self.client.ActivityDownloadFormat.GPX)
        data = self.client.download_activity(activity_id, dl_fmt=fmt)
        if isinstance(data, bytes):
            return data.decode("utf-8", errors="ignore")
        return data

    # === Workouts ===
    def get_workouts(self) -> list:
        return self.client.get_workouts()

    def get_workout_by_id(self, workout_id: int) -> dict:
        return self.client.get_workout_by_id(workout_id)

    def get_calendar(self, year: int, month: int) -> dict:
        return self.client.connectapi(calendar_month(year, month))

    def create_workout(self, name: str, sport: str, steps: list, description: str = "") -> dict:
        with self._training_lock:
            return create_workout(self.client, name, sport, steps, description)

    def schedule_workout(self, workout_id: int, date: str) -> dict:
        with self._training_lock:
            return schedule_workout(self.client, workout_id, date)

    # === Goals & Achievements ===
    def get_personal_record(self) -> dict:
        return self.client.get_personal_record()

    def get_earned_badges(self) -> dict:
        return self.client.get_earned_badges()

    def get_goals(self, status: str = "active") -> dict:
        return self.client.get_goals(status)

    def get_adhoc_challenges(self, start: int = 0, limit: int = 20) -> dict:
        return self.client.get_adhoc_challenges(start, limit)

    def get_badge_challenges(self, start: int = 0, limit: int = 20) -> dict:
        try:
            return self.client.get_badge_challenges(start, limit)
        except Exception as e:
            return {"error": str(e), "badge_challenges": []}

    def get_available_badge_challenges(self, start: int = 0, limit: int = 20) -> dict:
        try:
            return self.client.get_available_badge_challenges(start, limit)
        except Exception as e:
            return {"error": str(e), "available_badge_challenges": []}

    def get_non_completed_badge_challenges(self, start: int = 0, limit: int = 20) -> dict:
        try:
            return self.client.get_non_completed_badge_challenges(start, limit)
        except Exception as e:
            return {"error": str(e), "non_completed_badge_challenges": []}

    def get_inprogress_virtual_challenges(self, start: int = 0, limit: int = 20) -> dict:
        try:
            return self.client.get_inprogress_virtual_challenges(start, limit)
        except Exception as e:
            return {"error": str(e), "inprogress_virtual_challenges": []}

    # === Devices ===
    def get_devices(self) -> list:
        return self.client.get_devices()

    def get_device_settings(self, device_id: str) -> dict:
        return self.client.get_device_settings(device_id)

    def get_device_alarms(self) -> list:
        return self.client.get_device_alarms()

    def get_device_solar_data(self, device_id: str, start_date: str = None, end_date: str = None) -> dict:
        start = start_date or datetime.now().strftime("%Y-%m-%d")
        end = end_date or start
        return self.client.get_device_solar_data(device_id, start, end)

    def get_primary_training_device(self) -> dict:
        return self.client.get_primary_training_device()

    def get_device_last_used(self) -> dict:
        return self.client.get_device_last_used()

    # === Gear ===
    def get_gear(self) -> dict:
        user_id = self._get_user_id()
        return self.client.get_gear(user_id)

    def get_gear_defaults(self) -> dict:
        user_id = self._get_user_id()
        return self.client.get_gear_defaults(user_id)

    def get_gear_stats(self, gear_id: str) -> dict:
        return self.client.get_gear_stats(gear_id)

    def get_gear_ativities(self, gear_id: str) -> dict:
        return self.client.get_gear_ativities(gear_id)

    # === Women's Health ===
    def get_menstrual_calendar(self, start_date: str = None, end_date: str = None) -> dict:
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        return self.client.get_menstrual_calendar_data(start, end)

    def get_menstrual_data(self, date: str = None) -> dict:
        return self.client.get_menstrual_data_for_date(self._get_date(date))

    def get_pregnancy_summary(self) -> dict:
        return self.client.get_pregnancy_summary()

    # === Sync ===
    def sync_latest_data(self, days: int = 7) -> dict:
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        result = {
            "sync_period": {"start_date": start_date, "end_date": end_date},
            "data": {}
        }

        for name, fn in [
            ("activities", lambda: self.get_activities(0, 10)),
            ("sleep", lambda: self.get_sleep_data(end_date)),
            ("stress", lambda: self.get_stress_data(end_date)),
            ("hrv", lambda: self.get_hrv_data(end_date)),
            ("body_battery", lambda: self.get_body_battery(start_date, end_date)),
            ("user_profile", self.get_user_profile),
        ]:
            try:
                result["data"][name] = fn()
            except Exception as e:
                result["data"][f"{name}_error"] = str(e)

        return result


# Singleton
_client = None


def get_garmin_client() -> GarminClient:
    global _client
    if _client is None:
        _client = GarminClient()
    return _client
