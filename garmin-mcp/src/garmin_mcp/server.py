"""Garmin MCP Server - Garmin Connect health and activity APIs"""

import json
import asyncio
from datetime import datetime, timedelta

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from garmin_mcp.client import get_garmin_client
from garmin_mcp.training import CREATE_WORKOUT_SCHEMA


# The private health API intentionally exposes the complete Garmin MCP catalog.
# Pi receives the same catalog with explicit read/write guidance in its tool wrappers.


def get_tools() -> list[Tool]:
    """Return the standalone tool catalog, filtered by the HTTP entry point."""
    return [
        # === User & Profile ===
        Tool(name="get_full_name", description="Get user's full name", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_unit_system", description="Get user's unit system", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_user_profile", description="Get user profile", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_userprofile_settings", description="Get user profile settings", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_user_summary", description="Get user summary for date", inputSchema={"type": "object", "properties": {"date": {"type": "string", "description": "Date YYYY-MM-DD"}}}),
        
        # === Daily Health & Activity ===
        Tool(name="get_daily_steps", description="Get daily steps", inputSchema={"type": "object", "properties": {"date": {"type": "string"}, "days": {"type": "integer", "default": 1}}}),
        Tool(name="get_steps_data", description="Get steps data chart", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_floors", description="Get floors data", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_heart_rates", description="Get heart rates", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_rhr_day", description="Get resting heart rate", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_intensity_minutes", description="Get intensity minutes", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_all_day_stress", description="Get all-day stress", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_all_day_events", description="Get all-day events", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_stats", description="Get user activity summary", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_stats_and_body", description="Get activity data and body composition", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        
        # === Advanced Health Metrics ===
        Tool(name="get_max_metrics", description="Get max metrics (VO2 max, etc)", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_weight_goal", description="Get effective weight goal for a date", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_cycling_ftp", description="Get latest recorded cycling FTP", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_lactate_threshold", description="Get latest recorded running lactate threshold", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_fitness_age", description="Get fitness age", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_hrv_data", description="Get HRV data", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_hydration_data", description="Get hydration data", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        
        # === Historical Data & Trends ===
        Tool(name="get_weekly_steps", description="Get weekly steps", inputSchema={"type": "object", "properties": {"end_date": {"type": "string"}, "weeks": {"type": "integer", "default": 4}}}),
        Tool(name="get_weekly_stress", description="Get weekly stress", inputSchema={"type": "object", "properties": {"end_date": {"type": "string"}, "weeks": {"type": "integer", "default": 4}}}),
        Tool(name="get_progress_summary", description="Get progress summary", inputSchema={"type": "object", "properties": {"start_date": {"type": "string"}, "end_date": {"type": "string"}}}),
        
        # === Sleep & Stress ===
        Tool(name="get_sleep_data", description="Get sleep data", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_stress_data", description="Get stress data", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        
        # === Body Battery ===
        Tool(name="get_body_battery", description="Get body battery", inputSchema={"type": "object", "properties": {"start_date": {"type": "string"}, "end_date": {"type": "string"}}}),
        Tool(name="get_body_battery_events", description="Get body battery events", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        
        # === Body Composition & Weight ===
        Tool(name="get_body_composition", description="Get body composition", inputSchema={"type": "object", "properties": {"start_date": {"type": "string"}, "end_date": {"type": "string"}}}),
        Tool(name="get_weigh_ins", description="Get weigh-ins", inputSchema={"type": "object", "properties": {"start_date": {"type": "string"}, "end_date": {"type": "string"}}}),
        Tool(name="get_daily_weigh_ins", description="Get daily weigh-ins", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="add_weigh_in", description="Add a weigh-in to Garmin Connect (write)", inputSchema={"type": "object", "properties": {"weight_kg": {"type": "number", "description": "Weight in kilograms"}, "timestamp": {"type": "string", "description": "ISO 8601 timestamp with timezone offset"}}, "required": ["weight_kg", "timestamp"]}),
        
        # === Health Metrics ===
        Tool(name="get_respiration_data", description="Get respiration data", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_spo2_data", description="Get SpO2 data", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_blood_pressure", description="Get blood pressure", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        
        # === Training Status ===
        Tool(name="get_training_status", description="Get training status", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_training_readiness", description="Get training readiness", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_endurance_score", description="Get endurance score", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_hill_score", description="Get hill score", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_race_predictions", description="Get race predictions", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        
        # === Activities ===
        Tool(name="get_activities", description="Get activity list", inputSchema={"type": "object", "properties": {"start": {"type": "integer", "default": 0}, "limit": {"type": "integer", "default": 10}}}),
        Tool(name="get_activities_by_date", description="Get activities by date", inputSchema={"type": "object", "properties": {"start_date": {"type": "string"}, "end_date": {"type": "string"}, "activity_type": {"type": "string"}}}),
        Tool(name="get_activities_fordate", description="Get activities for date", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_activity", description="Get activity by ID", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_details", description="Get activity details", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_exercise_sets", description="Get activity exercise sets", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_gear", description="Get activity gear", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_types", description="Get activity types", inputSchema={"type": "object", "properties": {}}),
        Tool(name="set_activity_type", description="Set one activity's type", inputSchema={"type": "object", "required": ["activity_id", "type_key"], "properties": {"activity_id": {"type": "integer"}, "type_key": {"type": "string", "description": "Garmin activity type key, for example badminton"}}}),
        Tool(name="fix_badminton_activity_types", description="Find activities named badminton and change their type to badminton. Dry-run by default.", inputSchema={"type": "object", "properties": {"start_date": {"type": "string", "description": "YYYY-MM-DD"}, "end_date": {"type": "string", "description": "YYYY-MM-DD"}, "name_contains": {"type": "string", "default": "羽毛球"}, "dry_run": {"type": "boolean", "default": True}}}),
        Tool(name="get_activity_weather", description="Get activity weather", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_splits", description="Get activity splits", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_split_summaries", description="Get activity split summaries", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_typed_splits", description="Get activity typed splits", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_activity_hr_in_timezones", description="Get activity HR in timezones", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}}}),
        Tool(name="get_last_activity", description="Get last activity", inputSchema={"type": "object", "properties": {}}),
        Tool(name="download_activity", description="Download activity", inputSchema={"type": "object", "properties": {"activity_id": {"type": "integer"}, "format": {"type": "string", "default": "gpx"}}}),
        
        # === Workouts ===
        Tool(name="get_workouts", description="Get workouts", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_workout_by_id", description="Get workout by ID", inputSchema={"type": "object", "properties": {"workout_id": {"type": "integer"}}}),
        
        Tool(name="get_calendar", description="Read Garmin calendar activities and scheduled workouts; month is 1–12", inputSchema={"type": "object", "additionalProperties": False, "required": ["year", "month"], "properties": {"year": {"type": "integer", "minimum": 2000, "maximum": 2099}, "month": {"type": "integer", "minimum": 1, "maximum": 12}}}),
        Tool(name="create_workout", description="Create a timed Garmin workout template only when the user requests it. Does not schedule it. Identical application templates are reused.", inputSchema=CREATE_WORKOUT_SCHEMA),
        Tool(name="schedule_workout", description="Schedule an existing Garmin workout for a date the user requested. Read back the calendar; verified=true confirms it. Repeated workout/date is reused.", inputSchema={"type": "object", "additionalProperties": False, "required": ["workout_id", "date"], "properties": {"workout_id": {"type": "integer", "minimum": 1}, "date": {"type": "string", "format": "date"}}}),
        # === Goals & Achievements ===
        Tool(name="get_personal_record", description="Get personal records", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_earned_badges", description="Get earned badges", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_goals", description="Get goals", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_adhoc_challenges", description="Get adhoc challenges", inputSchema={"type": "object", "properties": {"start": {"type": "integer", "default": 0}, "limit": {"type": "integer", "default": 20}}}),
        Tool(name="get_badge_challenges", description="Get badge challenges", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_available_badge_challenges", description="Get available badge challenges", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_non_completed_badge_challenges", description="Get non-completed badge challenges", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_inprogress_virtual_challenges", description="Get in-progress virtual challenges", inputSchema={"type": "object", "properties": {}}),
        
        # === Devices ===
        Tool(name="get_devices", description="Get Garmin devices", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_device_settings", description="Get device settings", inputSchema={"type": "object", "properties": {"device_id": {"type": "string"}}}),
        Tool(name="get_device_alarms", description="Get device alarms", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_device_solar_data", description="Get device solar data", inputSchema={"type": "object", "properties": {"device_id": {"type": "string"}}}),
        Tool(name="get_primary_training_device", description="Get primary training device", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_device_last_used", description="Get last used device", inputSchema={"type": "object", "properties": {}}),
        
        # === Gear ===
        Tool(name="get_gear", description="Get gear/equipment", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_gear_defaults", description="Get gear defaults", inputSchema={"type": "object", "properties": {}}),
        Tool(name="get_gear_stats", description="Get gear stats", inputSchema={"type": "object", "properties": {"gear_id": {"type": "string"}}}),
        Tool(name="get_gear_ativities", description="Get gear activities", inputSchema={"type": "object", "properties": {"gear_id": {"type": "string"}}}),
        
        # === Women's Health ===
        Tool(name="get_menstrual_calendar", description="Get menstrual calendar", inputSchema={"type": "object", "properties": {"start_date": {"type": "string"}, "end_date": {"type": "string"}}}),
        Tool(name="get_menstrual_data", description="Get menstrual data for date", inputSchema={"type": "object", "properties": {"date": {"type": "string"}}}),
        Tool(name="get_pregnancy_summary", description="Get pregnancy summary", inputSchema={"type": "object", "properties": {}}),
        
        # === Sync ===
        Tool(name="sync_latest_data", description="Sync all data", inputSchema={"type": "object", "properties": {"days": {"type": "integer", "default": 7}}}),
    ]


HEALTH_TOOLS = frozenset(tool.name for tool in get_tools())


def create_server(allowed_tools: frozenset[str] | None = None) -> Server:
    """Create and configure MCP server"""
    server = Server("garmin-mcp")
    
    @server.list_tools()
    async def list_tools() -> list[Tool]:
        tools = get_tools()
        return tools if allowed_tools is None else [tool for tool in tools if tool.name in allowed_tools]
    
    @server.call_tool()
    async def call_tool(name: str, arguments: dict | None) -> list[TextContent]:
        if allowed_tools is not None and name not in allowed_tools:
            return [TextContent(type="text", text=json.dumps({"error": "Tool not allowed"}))]
        client = get_garmin_client()
        try:
            result = handle_tool_call(client, name, arguments or {})
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        except Exception as e:
            return [TextContent(type="text", text=json.dumps({"error": str(e)}, ensure_ascii=False))]
    
    return server


def handle_tool_call(client, name: str, arguments: dict) -> any:
    """Handle tool calls"""
    
    def get_date(arg="date") -> str:
        return arguments.get(arg) or datetime.now().strftime("%Y-%m-%d")
    
    def get_date_range() -> tuple:
        end = arguments.get("end_date") or datetime.now().strftime("%Y-%m-%d")
        start = arguments.get("start_date") or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        return start, end
    
    # === User & Profile ===
    if name == "get_full_name": return client.get_full_name()
    elif name == "get_unit_system": return client.get_unit_system()
    elif name == "get_user_profile": return client.get_user_profile()
    elif name == "get_userprofile_settings": return client.get_userprofile_settings()
    elif name == "get_user_summary": return client.get_user_summary(get_date())
    
    # === Daily Health & Activity ===
    elif name == "get_daily_steps": return client.get_daily_steps(date=get_date(), days=arguments.get("days", 1))
    elif name == "get_steps_data": return client.get_steps_data(get_date())
    elif name == "get_floors": return client.get_floors(get_date())
    elif name == "get_heart_rates": return client.get_heart_rates(get_date())
    elif name == "get_rhr_day": return client.get_rhr_day(get_date())
    elif name == "get_intensity_minutes": return client.get_intensity_minutes(get_date())
    elif name == "get_all_day_stress": return client.get_all_day_stress(get_date())
    elif name == "get_all_day_events": return client.get_all_day_events(get_date())
    elif name == "get_stats": return client.get_stats(get_date())
    elif name == "get_stats_and_body": return client.get_stats_and_body(get_date())
    
    # === Advanced Health Metrics ===
    elif name == "get_max_metrics": return client.get_max_metrics(get_date())
    elif name == "get_weight_goal": return client.get_weight_goal(get_date())
    elif name == "get_cycling_ftp": return client.get_cycling_ftp()
    elif name == "get_lactate_threshold": return client.get_lactate_threshold()
    elif name == "get_fitness_age": return client.get_fitness_age(get_date())
    elif name == "get_hrv_data": return client.get_hrv_data(get_date())
    elif name == "get_hydration_data": return client.get_hydration_data(get_date())
    
    # === Historical Data ===
    elif name == "get_weekly_steps": return client.get_weekly_steps(arguments.get("end_date"), arguments.get("weeks", 4))
    elif name == "get_weekly_stress": return client.get_weekly_stress(arguments.get("end_date"), arguments.get("weeks", 4))
    elif name == "get_progress_summary": return client.get_progress_summary(arguments.get("start_date"), arguments.get("end_date"))
    
    # === Sleep & Stress ===
    elif name == "get_sleep_data": return client.get_sleep_data(get_date())
    elif name == "get_stress_data": return client.get_stress_data(get_date())
    
    # === Body Battery ===
    elif name == "get_body_battery": 
        start, end = get_date_range()
        return client.get_body_battery(start, end)
    elif name == "get_body_battery_events": return client.get_body_battery_events(get_date())
    
    # === Body Composition ===
    elif name == "get_body_composition":
        start, end = get_date_range()
        return client.get_body_composition(start, end)
    elif name == "get_weigh_ins": return client.get_weigh_ins(arguments.get("start_date"), arguments.get("end_date"))
    elif name == "get_daily_weigh_ins": return client.get_daily_weigh_ins(get_date())
    elif name == "add_weigh_in": return client.add_weigh_in(arguments.get("weight_kg"), arguments.get("timestamp"))
    
    # === Health Metrics ===
    elif name == "get_respiration_data": return client.get_respiration_data(get_date())
    elif name == "get_spo2_data": return client.get_spo2_data(get_date())
    elif name == "get_blood_pressure": return client.get_blood_pressure(get_date())
    
    # === Training ===
    elif name == "get_training_status": return client.get_training_status(get_date())
    elif name == "get_training_readiness": return client.get_training_readiness(get_date())
    elif name == "get_endurance_score": return client.get_endurance_score(get_date())
    elif name == "get_hill_score": return client.get_hill_score(get_date())
    elif name == "get_race_predictions": return client.get_race_predictions(get_date())
    
    # === Activities ===
    elif name == "get_activities": return client.get_activities(arguments.get("start", 0), arguments.get("limit", 10))
    elif name == "get_activities_by_date": return client.get_activities_by_date(arguments.get("start_date"), arguments.get("end_date"), arguments.get("activity_type"))
    elif name == "get_activities_fordate": return client.get_activities_fordate(get_date())
    elif name == "get_activity": return client.get_activity(arguments.get("activity_id"))
    elif name == "get_activity_details": return client.get_activity_details(arguments.get("activity_id"))
    elif name == "get_activity_exercise_sets": return client.get_activity_exercise_sets(arguments.get("activity_id"))
    elif name == "get_activity_gear": return client.get_activity_gear(arguments.get("activity_id"))
    elif name == "get_activity_types": return client.get_activity_types()
    elif name == "set_activity_type": return client.set_activity_type(arguments.get("activity_id"), arguments.get("type_key"))
    elif name == "fix_badminton_activity_types":
        return client.fix_badminton_activity_types(
            arguments.get("start_date"),
            arguments.get("end_date"),
            arguments.get("name_contains", "羽毛球"),
            arguments.get("dry_run", True),
        )
    elif name == "get_activity_weather": return client.get_activity_weather(arguments.get("activity_id"))
    elif name == "get_activity_splits": return client.get_activity_splits(arguments.get("activity_id"))
    elif name == "get_activity_split_summaries": return client.get_activity_split_summaries(arguments.get("activity_id"))
    elif name == "get_activity_typed_splits": return client.get_activity_typed_splits(arguments.get("activity_id"))
    elif name == "get_activity_hr_in_timezones": return client.get_activity_hr_in_timezones(arguments.get("activity_id"))
    elif name == "get_last_activity": return client.get_last_activity()
    elif name == "download_activity": return client.download_activity(arguments.get("activity_id"), arguments.get("format", "gpx"))
    
    # === Workouts ===
    elif name == "get_workouts": return client.get_workouts()
    elif name == "get_workout_by_id": return client.get_workout_by_id(arguments.get("workout_id"))
    elif name == "get_calendar": return client.get_calendar(arguments.get("year"), arguments.get("month"))
    elif name == "create_workout": return client.create_workout(**arguments)
    elif name == "schedule_workout": return client.schedule_workout(arguments.get("workout_id"), arguments.get("date"))
    
    # === Goals & Achievements ===
    elif name == "get_personal_record": return client.get_personal_record()
    elif name == "get_earned_badges": return client.get_earned_badges()
    elif name == "get_goals": return client.get_goals()
    elif name == "get_adhoc_challenges": return client.get_adhoc_challenges(arguments.get("start", 0), arguments.get("limit", 20))
    elif name == "get_badge_challenges": return client.get_badge_challenges()
    elif name == "get_available_badge_challenges": return client.get_available_badge_challenges()
    elif name == "get_non_completed_badge_challenges": return client.get_non_completed_badge_challenges()
    elif name == "get_inprogress_virtual_challenges": return client.get_inprogress_virtual_challenges()
    
    # === Devices ===
    elif name == "get_devices": return client.get_devices()
    elif name == "get_device_settings": return client.get_device_settings(arguments.get("device_id"))
    elif name == "get_device_alarms": return client.get_device_alarms()
    elif name == "get_device_solar_data": return client.get_device_solar_data(arguments.get("device_id"))
    elif name == "get_primary_training_device": return client.get_primary_training_device()
    elif name == "get_device_last_used": return client.get_device_last_used()
    
    # === Gear ===
    elif name == "get_gear": return client.get_gear()
    elif name == "get_gear_defaults": return client.get_gear_defaults()
    elif name == "get_gear_stats": return client.get_gear_stats(arguments.get("gear_id"))
    elif name == "get_gear_ativities": return client.get_gear_ativities(arguments.get("gear_id"))
    
    # === Women's Health ===
    elif name == "get_menstrual_calendar": return client.get_menstrual_calendar(arguments.get("start_date"), arguments.get("end_date"))
    elif name == "get_menstrual_data": return client.get_menstrual_data(arguments.get("date"))
    elif name == "get_pregnancy_summary": return client.get_pregnancy_summary()
    
    # === Sync ===
    elif name == "sync_latest_data": return client.sync_latest_data(arguments.get("days", 7))
    
    else:
        return {"error": f"Unknown tool: {name}"}


async def main():
    server = create_server()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
