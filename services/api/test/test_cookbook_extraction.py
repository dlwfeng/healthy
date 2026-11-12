"""Regression coverage for translated PDF layout boundaries; no network or ports."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("cookbook", Path(__file__).parents[1] / "scripts/extract-cookbook.py")
cookbook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cookbook)


def line(text, x=76.7, bold=False, size=14.2, page=1):
    return {"text": text, "x": x, "bold": bold, "size": size, "page": page, "y": 100}


class CookbookExtractionTest(unittest.TestCase):
    def test_wrapped_servings_and_cross_page_ingredients(self):
        servings, intro, ingredients, steps, notes = cookbook.parse_content([
            line("6至8人份（作为配菜），或", x=80, bold=True),
            line("4人份（作为主菜）", x=240, bold=True),
            line("一道简单的", x=98.1), line("家常菜。"),
            line("酱汁", x=98.1, bold=True),
            line("1½ 杯 番茄，切成", x=118, bold=True),
            line("小块", x=96.7, page=2),
            line("半至1茶匙 粗盐", x=118, bold=True, page=2),
            line("硬皮面包，佐餐用", x=98.1, page=2),
            line("1. 混合番茄", x=98.1, bold=True, page=2),
            line("和盐。", page=2),
            line("2. 盛入碗中。", x=98.1, bold=True, page=2),
            line("小贴士", x=92.8, bold=True, size=11),
            line("冷藏后风味更好。", size=11),
        ])
        self.assertEqual(servings, "6至8人份（作为配菜），或4人份（作为主菜）")
        self.assertEqual(intro, "一道简单的家常菜。")
        self.assertEqual(len(ingredients), 3)
        self.assertEqual(ingredients[0]["quantity"], "1½")
        self.assertEqual(ingredients[0]["unit"], "杯")
        self.assertEqual(ingredients[0]["text"], "1½ 杯 番茄，切成小块")
        self.assertEqual(ingredients[0]["group_name"], "酱汁")
        self.assertEqual(ingredients[1]["quantity"], "半至1")
        self.assertEqual(steps, ["混合番茄和盐。", "盛入碗中。"])
        self.assertIn("冷藏后风味更好。", notes)

    def test_translation_file_marker_does_not_mask_servings(self):
        servings, intro, ingredients, steps, _ = cookbook.parse_content([
            line("--- START OF FILE 2.txt ---"),
            line("2人份", x=285, bold=True),
            line("自制配菜。", x=98.1),
            line("1 杯 豆子", x=118, bold=True),
            line("1. 煮熟。", x=98.1, bold=True),
        ])
        self.assertEqual(servings, "2人份")
        self.assertEqual(intro, "自制配菜。")
        self.assertEqual(len(ingredients), 1)
        self.assertEqual(steps, ["煮熟。"])


if __name__ == "__main__":
    unittest.main()
