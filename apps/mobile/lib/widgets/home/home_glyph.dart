import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

// Same 24px semantic paths and stroke treatment as the approved web homepage.
class HomeGlyph extends StatelessWidget {
  const HomeGlyph(this.name, {super.key, this.color, this.size = 22});
  final String name;
  final Color? color;
  final double size;
  static const paths = <String, String>{
    'steps':
        '''<path d="M8 3C6 3 5 6 5 8s1 3 3 3 3-1 3-3-1-5-3-5Zm8 7c-2 0-3 3-3 5s1 3 3 3 3-1 3-3-1-5-3-5Z"/><path d="M5 14h6v3a3 3 0 0 1-6 0m8 7h6"/>''',
    'moon':
        '''<path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5 8.7 8.7 0 1 0 20.5 14.4Z"/><path d="M17 3v4m-2-2h4"/>''',
    'battery':
        '''<rect x="3" y="6" width="17" height="12" rx="2"/><path d="M22 10v4M7 10v4m4-4v4m4-4v4"/>''',
    'flame':
        '''<path d="M12 3c1 5 6 6 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 3 1 4 2 4 2-3 2-6 1-9Z"/>''',
    'readiness':
        '''<circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m6 1 2-2m-8 5v4l3 2"/>''',
    'load':
        '''<path d="M4 18a9 9 0 1 1 16 0M5 18h14m-7-6 5-5M5 9l2 1m10 0 2-1M12 3v2"/><circle cx="12" cy="12" r="1"/>''',
    'focus':
        '''<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m11 7-5 9m7-9 5 9M7 18h10"/>''',
    'hrv': '''<path d="M3 12h4l2-6 4 12 2-6h6M4 6l1-1m14 14 1-1"/>''',
    'intensity':
        '''<circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m7 2 2-2m-8 4-4 5h5l-3 4"/>''',
    'training': '''<path d="M3 17h4l4-10 4 14 3-8h3M3 4h5"/>''',
    'person':
        '''<circle cx="12" cy="5" r="2"/><path d="M9 21v-6H7l2-6h6l2 6h-2v6M9 10l-3 3m9-3 3 3"/>''',
    'stairs': '''<path d="M3 21h5v-5h5v-5h5V6h3M3 9l6-6m-6 0h6v6"/>''',
    'stress':
        '''<path d="M8 21v-4a7 7 0 1 1 10-6l2 3h-3v4h-4v3M7 10l2-2 2 4 2-3h2"/>''',
    'heart':
        '''<path d="M20.8 8.5c0 4.3-8.8 11-8.8 11S3.2 12.8 3.2 8.5a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/>''',
    'lungs':
        '''<path d="M12 3v9m0-3L8 6C5 9 3 12 3 17c0 3 5 3 7 0v-5m2-3 4-3c3 3 5 6 5 11 0 3-5 3-7 0v-5M8 10l4 3 4-3"/>''',
    'bike':
        '''<circle cx="5" cy="16" r="4"/><circle cx="19" cy="16" r="4"/><path d="m5 16 5-8 5 8H5m10 0 3-11h-3M8 5h4"/>''',
    'run':
        '''<circle cx="15" cy="4" r="2"/><path d="m7 21 3-5 3-3 3 2 4 1M5 12l5-3 4 1 3 3M10 9l1-4"/>''',
    'walk':
        '''<circle cx="13" cy="4" r="2"/><path d="m9 21 2-7 4 7M7 12l4-5 3 1 3 5m-6-6v7"/>''',
    'badminton':
        '''<ellipse cx="15" cy="7" rx="4.5" ry="6" transform="rotate(35 15 7)"/><path d="m11 12-6 9m0-3 2 2m5-16 7 6m-8-3 6 6"/>''',
    'vo2':
        '''<path d="M12 3v8m0-2L8 6C5 9 3 12 3 17c0 3 5 3 7 0v-4m2-4 4-3c3 3 5 6 5 11 0 3-5 3-7 0v-4M8 10l4 3 4-3"/>''',
    'oxygen':
        '''<path d="M12 3c-2 3-7 7-7 12a7 7 0 0 0 14 0c0-5-5-9-7-12Z"/><circle cx="12" cy="15" r="3"/>''',
    'drop':
        '''<path d="M12 3c-2 3-7 7-7 12a7 7 0 0 0 14 0c0-5-5-9-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>''',
    'scale':
        '''<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8a6 6 0 0 1 8 0l-4 5Z"/>''',
    'bmi':
        '''<path d="M8 3c0 3-2 5-2 9s2 6 2 9m8-18c0 3 2 5 2 9s-2 6-2 9M5 11h14v5H5Z"/><path d="M9 11v2m6-2v2"/>''',
    'muscle':
        '''<path d="M4 15c2-1 4-2 5-6l-2-3 3-3 3 2v4l-2 3c2-2 5-2 7 0s3 6 1 8H8l-4-5ZM13 15l3 1"/>''',
    'fat':
        '''<path d="M12 3c-2 3-7 7-7 12a7 7 0 0 0 14 0c0-5-5-9-7-12Z"/><path d="m9 17 6-5"/><circle cx="9" cy="12" r=".5"/><circle cx="15" cy="17" r=".5"/>''',
    'waist':
        '''<path d="M7 3c1 3 1 5 0 8s-1 6 0 10m10-18c-1 3-1 5 0 8s1 6 0 10M5 12c4 3 10 3 14 0m-9 5h4"/>''',
    'bone':
        '''<path d="M5 9a3 3 0 1 1 3-5l1 2 9 9 2 1a3 3 0 1 1-4 4l-1-2-9-9-1 0Z"/>''',
    'protein':
        '''<circle cx="6" cy="6" r="3"/><circle cx="18" cy="7" r="3"/><circle cx="12" cy="18" r="3"/><path d="m9 6 6 1m-8 2 4 6m6-5-4 5"/>''',
    'carbs':
        '''<path d="M12 21V7m0 3C7 10 5 7 6 4c4 0 6 3 6 6Zm0 5c-5 0-7-3-6-6m6 1c5 0 7-3 6-6-4 0-6 3-6 6Zm0 5c5 0 7-3 6-6M12 3v2"/>''',
    'nutrition':
        '''<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9M12 12l-6 7"/>''',
    'score':
        '''<circle cx="12" cy="9" r="6"/><path d="m8 14-2 7 6-3 6 3-2-7m-7-5 2 2 4-4"/>''',
    'food':
        '''<path d="M4 3v8a3 3 0 0 0 3 3h1v7M7 3v8M10 3v8m7-8v18m0-18c4 3 5 7 0 10"/>''',
    'journal':
        '''<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 7h14M9 12h6m-6 4h6"/>''',
    'sun':
        '''<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>''',
    'calendar':
        '''<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>''',
    'bolt': '''<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>''',
    'chevron': '''<path d="m9 5 7 7-7 7"/>''',
  };
  @override
  Widget build(BuildContext context) => SvgPicture.string(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths['journal']}</svg>',
    width: size,
    height: size,
    excludeFromSemantics: true,
    colorFilter: ColorFilter.mode(
      color ?? Theme.of(context).colorScheme.primary,
      BlendMode.srcIn,
    ),
  );
}
