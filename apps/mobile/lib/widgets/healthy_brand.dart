import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

const healthyAppName = 'healthy';

class HealthyLogo extends StatelessWidget {
  const HealthyLogo({super.key, this.size = 32});

  final double size;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/brand/healthy.svg',
    width: size,
    height: size,
    excludeFromSemantics: true,
  );
}

class HealthyBrand extends StatelessWidget {
  const HealthyBrand({super.key});

  @override
  Widget build(BuildContext context) => const Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      HealthyLogo(),
      SizedBox(width: 10),
      Text(
        healthyAppName,
        style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
      ),
    ],
  );
}
