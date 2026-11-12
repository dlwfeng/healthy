import unittest
from unittest.mock import Mock
from copy import deepcopy

from garmin_mcp.training import calendar_month, workout_payload, create_workout, schedule_workout


class TrainingTests(unittest.TestCase):
    def test_validates_before_writing(self):
        self.assertEqual(calendar_month(2026, 10), "/calendar-service/year/2026/month/9")
        with self.assertRaises(ValueError):
            calendar_month(2026, 0)
        with self.assertRaises(ValueError):
            workout_payload("Test", "running", [{"type": "interval", "duration_seconds": True}])
        with self.assertRaises(ValueError):
            workout_payload("Test", "running", [{"type": "interval", "duration_seconds": 60, "target_hr_zone": 6}])
        client = Mock()
        with self.assertRaises(ValueError):
            schedule_workout(client, 1, "2026-02-30")
        with self.assertRaises(ValueError):
            schedule_workout(client, 1, "2000-01-01")
        client.schedule_workout.assert_not_called()

    def test_creation_paginates_and_reuses_identical_template(self):
        steps = [{"type": "warmup", "duration_seconds": 300}, {"type": "interval", "duration_seconds": 900, "target_hr_zone": 2}]
        payload = workout_payload("Easy", "running", steps)
        self.assertEqual(payload["estimatedDurationInSecs"], 1200)
        self.assertEqual(payload["workoutSegments"][0]["workoutSteps"][1]["targetType"]["workoutTargetTypeId"], 4)
        self.assertEqual(workout_payload("Yoga", "yoga", steps)["sportType"]["sportTypeId"], 7)
        client = Mock()
        client.get_workouts.side_effect = [[{"workoutName": "Other"}] * 100, [{"workoutId": 7, "workoutName": "Easy"}]]
        client.get_workout_by_id.return_value = {**payload, "workoutId": 7}
        result = create_workout(client, "Easy", "running", steps)
        self.assertTrue(result["reused"])
        self.assertEqual(client.get_workouts.call_args.kwargs["start"], 100)
        client.upload_workout.assert_not_called()

    def test_schedule_is_idempotent_and_does_not_duplicate_on_readback_failure(self):
        client = Mock()
        client.connectapi.return_value = {"calendarItems": [{"id": 99, "workoutId": 7, "itemType": "workout", "date": "2099-01-02"}]}
        result = schedule_workout(client, 7, "2099-01-02")
        self.assertTrue(result["already_scheduled"])
        client.schedule_workout.assert_not_called()
        client.connectapi.return_value = {"calendarItems": []}
        client.schedule_workout.return_value = {"workoutScheduleId": 99, "workout": {"workoutName": "Easy"}}
        client.get_scheduled_workout_by_id.side_effect = RuntimeError("read unavailable")
        result = schedule_workout(client, 7, "2099-01-02")
        self.assertFalse(result["verified"])
        self.assertIn("pending", result["warning"])
        client.schedule_workout.assert_called_once()

    def test_template_readback_detects_wrong_targets_and_manual_edits(self):
        steps = [{"type": "interval", "duration_seconds": 900, "target_hr_zone": 2}]
        payload = workout_payload("Easy", "running", steps)
        changed = deepcopy(payload)
        changed["workoutSegments"][0]["workoutSteps"][0]["endConditionValue"] = 1200
        client = Mock()
        client.get_workouts.return_value = [{"workoutId": 7, "workoutName": "Easy"}]
        # A manually edited template retains its fingerprint but cannot be reused.
        client.get_workout_by_id.side_effect = [{**changed, "workoutId": 7}, {**payload, "workoutId": 8}]
        client.upload_workout.return_value = {"workoutId": 8}
        result = create_workout(client, "Easy", "running", steps)
        self.assertFalse(result["reused"])
        self.assertTrue(result["verified"])
        wrong_target = deepcopy(payload)
        wrong_target["workoutSegments"][0]["workoutSteps"][0]["targetType"]["workoutTargetTypeId"] = 2
        client = Mock()
        client.get_workouts.return_value = []
        client.upload_workout.return_value = {"workoutId": 9}
        client.get_workout_by_id.return_value = wrong_target
        result = create_workout(client, "Easy", "running", steps)
        self.assertFalse(result["verified"])
        self.assertEqual(result["workout_id"], 9)


if __name__ == "__main__":
    unittest.main()
