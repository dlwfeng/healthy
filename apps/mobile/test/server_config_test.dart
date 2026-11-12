import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/server_config.dart';

class MemoryStore extends MealLocalStore {
  final values = <String, Map<String, dynamic>>{};

  @override
  Future<Map<String, dynamic>?> read(String name) async => values[name];

  @override
  Future<void> write(String name, Map<String, dynamic> value) async {
    values[name] = jsonDecode(jsonEncode(value)) as Map<String, dynamic>;
  }

  @override
  Future<void> clear(String name) async => values.remove(name);
}

void main() {
  test('a saved address wins over the build default', () async {
    final store = MemoryStore()
      ..values['settings'] = {'server': 'https://saved.example.test/'};
    expect(await loadServer(store), 'https://saved.example.test');
    expect(store.values['settings']!['server'], 'https://saved.example.test');
  });

  test('the legacy hostname follows the build configuration', () async {
    final store = MemoryStore()..values['settings'] = {'server': legacyServer};
    expect(await loadServer(store), defaultServer);
    expect(store.values['settings']!['server'], defaultServer);
  });

  test('a missing or invalid address falls back to the build default', () async {
    expect(await loadServer(MemoryStore()), defaultServer);
    final broken = MemoryStore()..values['settings'] = {'server': 'not-a-url'};
    expect(await loadServer(broken), defaultServer);
  });
}
