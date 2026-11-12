/// 后端服务地址配置
///
/// 正式安装包的服务地址在构建时注入（`--dart-define=HEALTH_API_URL=...`），
/// 由 `scripts/deploy-mobile.py` 从项目根目录未提交的 `.env` 读取，
/// 源码仓库不保存实际地址。
library;

/// 旧版本内置的局域网地址，仅作为本机开发构建的回退值和一次性迁移来源。
const legacyServer = 'http://localhost:3060';

/// 当前构建使用的服务地址。
const defaultServer = String.fromEnvironment(
  'HEALTH_API_URL',
  defaultValue: legacyServer,
);
