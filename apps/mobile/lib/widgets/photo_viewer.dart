import 'dart:typed_data';

import 'package:flutter/material.dart';

/// One photo shown in the full-screen viewer.
class MealPhoto {
  MealPhoto.network(this.url) : bytes = null;

  MealPhoto.memory(Uint8List data) : url = null, bytes = data;

  final String? url;
  final Uint8List? bytes;

  ImageProvider get provider =>
      url != null ? NetworkImage(url!) : MemoryImage(bytes!);
}

/// Full-screen photo viewer that supports swiping between photos and pinch
/// zoom on the current one.
class MealPhotoViewer extends StatefulWidget {
  const MealPhotoViewer({
    super.key,
    required this.photos,
    this.initialIndex = 0,
    this.title = '餐食照片',
  });

  final List<MealPhoto> photos;
  final int initialIndex;
  final String title;

  static Future<void> open(
    BuildContext context, {
    required List<MealPhoto> photos,
    int initialIndex = 0,
    String title = '餐食照片',
  }) {
    if (photos.isEmpty) return Future.value();
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MealPhotoViewer(
          photos: photos,
          initialIndex: initialIndex.clamp(0, photos.length - 1),
          title: title,
        ),
      ),
    );
  }

  @override
  State<MealPhotoViewer> createState() => _MealPhotoViewerState();
}

class _MealPhotoViewerState extends State<MealPhotoViewer> {
  late final PageController _controller;
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _controller = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = widget.photos.length;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(count > 1 ? '${_index + 1} / $count' : widget.title),
      ),
      body: PageView.builder(
        controller: _controller,
        itemCount: count,
        onPageChanged: (index) => setState(() => _index = index),
        itemBuilder: (context, index) => _ZoomablePhoto(
          photo: widget.photos[index],
          label: '${widget.title} ${index + 1}',
        ),
      ),
    );
  }
}

class _ZoomablePhoto extends StatefulWidget {
  const _ZoomablePhoto({required this.photo, required this.label});

  final MealPhoto photo;
  final String label;

  @override
  State<_ZoomablePhoto> createState() => _ZoomablePhotoState();
}

class _ZoomablePhotoState extends State<_ZoomablePhoto> {
  final _transformation = TransformationController();
  bool _zoomed = false;

  @override
  void initState() {
    super.initState();
    _transformation.addListener(_syncZoomState);
  }

  @override
  void dispose() {
    _transformation.removeListener(_syncZoomState);
    _transformation.dispose();
    super.dispose();
  }

  void _syncZoomState() {
    final zoomed = _transformation.value.getMaxScaleOnAxis() > 1.01;
    if (zoomed != _zoomed) setState(() => _zoomed = zoomed);
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      transformationController: _transformation,
      minScale: 1,
      maxScale: 5,
      // Keep horizontal swipes for the PageView until the photo is zoomed in.
      panEnabled: _zoomed,
      child: Center(
        child: Image(
          image: widget.photo.provider,
          fit: BoxFit.contain,
          semanticLabel: widget.label,
          errorBuilder: (_, _, _) => const Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.broken_image_outlined,
                  color: Colors.white70,
                  size: 40,
                ),
                SizedBox(height: 8),
                Text('照片暂时无法加载', style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
