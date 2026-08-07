#!/usr/bin/env node
/**
 * Migrate throw new CliError with hardcoded Chinese to cliError(I18N_KEYS.*).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, '..');
const srcRoot = path.join(pkgRoot, 'src');
const bundledDataPath = path.join(srcRoot, 'i18n/bundled-data.json');
const bundledTsPath = path.join(srcRoot, 'i18n/bundled.ts');

function tsKeyFromJsonKey(jsonKey) {
  return jsonKey.startsWith('cli.') ? jsonKey.slice(4).replace(/\./g, '_') : jsonKey;
}

/** message template -> i18n key config */
const ENTRIES = [
  ['请至少提供 listing 或 --display-* 之一', 'cli.collection_listing_or_display_required', 'Provide listing or at least one --display-* flag'],
  ['请提供 --description', 'cli.collection_description_required', 'Provide --description'],
  ['--status 只能是 0 或 1', 'cli.status_must_be_0_or_1', '--status must be 0 or 1'],
  ['非交互 publish 需要 --yes', 'cli.non_interactive_publish_needs_yes', 'Non-interactive publish requires --yes'],
  ['非交互 bind 需要 --yes', 'cli.non_interactive_bind_needs_yes', 'Non-interactive bind requires --yes'],
  ['缺少 --file 或 --sha1', 'cli.missing_file_or_sha1', 'Missing --file or --sha1'],
  ['缺少 -v / --version-range', 'cli.missing_version_range', 'Missing -v / --version-range'],
  ['缺少 --policy-map <file>', 'cli.missing_policy_map', 'Missing --policy-map <file>'],
  ['非交互需要 --yes', 'cli.non_interactive_needs_yes', 'Non-interactive mode requires --yes'],
  ['非法 --scaffold', 'cli.invalid_scaffold', 'Invalid --scaffold'],
  ['--runtime 仅支持 0.4 或 0.5', 'cli.runtime_only_04_05', '--runtime only supports 0.4 or 0.5'],
  ['--pm 仅支持 pnpm|npm|yarn', 'cli.pm_only_pnpm_npm_yarn', '--pm only supports pnpm|npm|yarn'],
  ['语言仅支持 zh_CN 或 en_US', 'cli.locale_only_zh_en', 'Locale must be zh_CN or en_US'],
  ['缺少登录名或密码', 'cli.missing_login_credentials', 'Missing login name or password'],
  ['登录响应缺少 token/cookie', 'cli.login_response_missing_token', 'Login response missing token/cookie'],
  ['缺少 --resource-type', 'cli.missing_resource_type_flag', 'Missing --resource-type'],
  ['非交互上架需要 --yes', 'cli.non_interactive_online_needs_yes', 'Non-interactive online requires --yes'],
  ['非交互下架需要 --yes', 'cli.non_interactive_offline_needs_yes', 'Non-interactive offline requires --yes'],
  ['--all 与 --collection 不能同时使用', 'cli.all_and_collection_mutually_exclusive', '--all and --collection cannot be used together'],
  ['未找到含 freelog.manifest.json 的子资源目录', 'cli.no_child_manifest_dir', 'No child directory with freelog.manifest.json found'],
  ['未找到资源类型: ${String(args.keyword)}', 'cli.resource_type_not_found', 'Resource type not found: {keyword}'],
  ['非法 --category', 'cli.invalid_category', 'Invalid --category'],
  ['请至少提供 --title/--intro/--cover/--tags 之一', 'cli.update_at_least_one_field', 'Provide at least one of --title/--intro/--cover/--tags'],
  ['--runtime 仅 0.4|0.5', 'cli.runtime_flag_only_04_05', '--runtime must be 0.4|0.5'],
  ['version 与 filePath 必填', 'cli.version_and_filepath_required', 'version and filePath are required'],
  ['缺少 --version', 'cli.missing_version_flag', 'Missing --version'],
  ['${label} 不是合法 JSON: ${file}', 'cli.label_not_valid_json', '{label} is not valid JSON: {file}'],
  ['${label} 格式非法', 'cli.label_format_invalid', '{label} format is invalid'],
  ['manifest.subject 只能是 resource 或 collection', 'cli.manifest_subject_invalid', 'manifest.subject must be resource or collection'],
  ['manifest.identity.name 必填', 'cli.manifest_identity_name_required', 'manifest.identity.name is required'],
  ['manifest.resource.typeCode 必填', 'cli.manifest_type_code_required', 'manifest.resource.typeCode is required'],
  ['manifest.resource.title 必填', 'cli.manifest_title_required', 'manifest.resource.title is required'],
  ['项目 state 环境与当前 API 环境不一致', 'cli.project_state_env_mismatch', 'Project state environment does not match current API environment'],
  ['未找到 freelog.manifest.json', 'cli.manifest_not_found', 'freelog.manifest.json not found'],
  ['当前目录不是单品资源 manifest', 'cli.not_single_resource_manifest', 'Current directory is not a single-resource manifest'],
  ['当前目录不是合集 manifest', 'cli.not_collection_manifest', 'Current directory is not a collection manifest'],
  ['未登录', 'cli.not_logged_in', 'Not logged in'],
  ['登录环境与当前 API 环境不一致', 'cli.login_env_mismatch', 'Login environment does not match current API environment'],
  ['未初始化 @freelog/tools-lib2（缺少 installToolsLibForNode）', 'cli.tools_lib_not_initialized', '@freelog/tools-lib2 not initialized (missing installToolsLibForNode)'],
  ['文件不存在: ${filePath}', 'cli.file_not_found', 'File not found: {path}'],
  ['已取消', 'cli.cancelled', 'Cancelled'],
  ['目录内没有可导入的媒体文件: ${absDir}', 'cli.no_importable_media_in_dir', 'No importable media files in directory: {dir}'],
  ['目录内没有可导入的媒体文件: ${absMedia}', 'cli.no_importable_media_in_dir', 'No importable media files in directory: {dir}'],
  ['已取消批量导入', 'cli.cancelled_batch_import', 'Batch import cancelled'],
  ['缺少 resourceId 或 username/shortname', 'cli.missing_resource_id_or_name', 'Missing resourceId or username/shortname'],
  ['目录已绑定 ${local.resourceId}', 'cli.dir_already_bound', 'Directory already bound to {resourceId}'],
  ['远端已有合集发版草稿，且与本地不一致', 'cli.collection_draft_remote_conflict', 'Remote collection release draft exists and differs from local'],
  ['本地与平台合集发版草稿均有变更', 'cli.collection_draft_both_changed', 'Both local and platform collection release drafts have changes'],
  ['平台合集发版草稿已更新', 'cli.collection_draft_platform_updated', 'Platform collection release draft was updated'],
  ['无平台合集发版草稿', 'cli.no_platform_collection_draft', 'No platform collection release draft'],
  ['auth-excluded 文件不存在: ${absolute}', 'cli.auth_excluded_file_not_found', 'auth-excluded file not found: {path}'],
  ['无法解析 auth-excluded 文件（需 yaml/json 数组）', 'cli.auth_excluded_parse_failed', 'Cannot parse auth-excluded file (expected yaml/json array)'],
  ['auth-excluded 文件必须是数组', 'cli.auth_excluded_must_be_array', 'auth-excluded file must be an array'],
  ['auth-excluded[${index}] 必须是对象', 'cli.auth_excluded_item_must_be_object', 'auth-excluded[{index}] must be an object'],
  ['auth-excluded[${index}] 缺少 resourceId/excludedValue', 'cli.auth_excluded_item_missing_fields', 'auth-excluded[{index}] missing resourceId/excludedValue'],
  ['auth-excluded[${index}].excludedType 只能是 contractId|policyId', 'cli.auth_excluded_invalid_excluded_type', 'auth-excluded[{index}].excludedType must be contractId|policyId'],
  ['customPropertyDescriptors.type 不合法: ${desc.type}', 'cli.custom_property_type_invalid', 'customPropertyDescriptors.type invalid: {type}'],
  ['本地无合集 resourceId，请先 collection create 或 pull --collection', 'cli.no_collection_resource_id', 'No local collection resourceId; run collection create or pull --collection first'],
  ['本地与平台合集信息不一致', 'cli.collection_info_mismatch', 'Local and platform collection info differ'],
  ['本地已有合集 resourceId，勿重复 create', 'cli.collection_already_exists', 'Local collection resourceId already exists; do not create again'],
  ['缺少合集标题', 'cli.collection_title_required', 'Collection title is required'],
  ['缺少合集类型 resourceTypeCode', 'naming_convention_resource_type_required', 'Please select a resource type'],
  ['collection create 响应缺少 resourceId', 'cli.collection_create_missing_resource_id', 'collection create response missing resourceId'],
  ['路径资源不属于当前登录账号', 'cli.path_resource_not_owned', 'Path resource does not belong to current account'],
  ['路径资源缺少 resourceId 或 owner 不符', 'cli.path_resource_invalid', 'Path resource missing resourceId or owner mismatch'],
  ['路径目录缺少 resourceId', 'cli.path_dir_missing_resource_id', 'Path directory missing resourceId'],
  ['子资源缺少 resourceId，无法加入合集', 'cli.child_missing_resource_id', 'Child resource missing resourceId; cannot add to collection'],
  ['子资源上架门禁未满足，无法加入合集', 'cli.child_online_gate_failed', 'Child resource online gates not met; cannot add to collection'],
  ['部分单品未能加入合集目录草稿', 'cli.partial_items_not_added_to_draft', 'Some items could not be added to collection catalogue draft'],
  ['缺少 itemId', 'cli.missing_item_id', 'Missing itemId'],
  ['缺少 --title', 'cli.missing_title_flag', 'Missing --title'],
  ['order 文件不存在: ${file}', 'cli.order_file_not_found', 'Order file not found: {file}'],
  ['order 文件须为 JSON 字符串数组', 'cli.order_file_must_be_string_array', 'Order file must be a JSON string array'],
  ['请提供 --order-file / itemIds，或 --sort-field', 'cli.order_or_sort_required', 'Provide --order-file / itemIds, or --sort-field'],
  ['简介长度不能超过 1000', 'cli.intro_max_1000', 'Introduction must not exceed 1000 characters'],
  ['合集资源目前为平台固定版本，不能设置版本号', 'cli.collection_fixed_version', 'Collection resources have a fixed platform version; cannot set version'],
  ['合集单品授权未完成', 'cli.collection_item_auth_incomplete', 'Collection item authorization incomplete'],
  ['无法 pull：缺少合集 resourceId / resourceName', 'cli.collection_pull_missing_id', 'Cannot pull: missing collection resourceId / resourceName'],
  ['无权 pull 他人合集到本地写缓存（Owner 不符）', 'cli.collection_pull_owner_denied', "Cannot pull another user's collection to local cache (owner mismatch)"],
  ['规则文件不存在: ${file}', 'cli.rules_file_not_found', 'Rules file not found: {file}'],
  ['collect-rules 文件不是合法 JSON', 'cli.collect_rules_invalid_json', 'collect-rules file is not valid JSON'],
  ['请提供 --from-file 或 --status + --condition-type', 'cli.collect_rules_input_required', 'Provide --from-file or --status + --condition-type'],
  ['缺少 feedUrl', 'cli.missing_feed_url', 'Missing feedUrl'],
  ['缺少验证码 --code（请查邮箱后注入）', 'cli.missing_verification_code', 'Missing verification code --code (check email and inject)'],
  ['RSS 同步失败', 'cli.rss_sync_failed', 'RSS sync failed'],
  ['RSS 同步超时', 'cli.rss_sync_timeout', 'RSS sync timed out'],
  ['找不到 template-compat.json', 'cli.template_compat_not_found', 'template-compat.json not found'],
  ['template-compat.json 校验失败', 'cli.template_compat_validation_failed', 'template-compat.json validation failed'],
  ['未知前端库模板: ${opts.templateId}', 'cli.unknown_frontend_template', 'Unknown frontend library template: {templateId}'],
  ['当前 CLI 不支持运行时档 ${runtime}', 'cli.runtime_not_supported', 'Current CLI does not support runtime {runtime}'],
  ['运行时 ${runtime} 下无模板 ${opts.templateId}', 'cli.no_template_for_runtime', 'No template {templateId} for runtime {runtime}'],
  ['缺少 template.manifest.json: ${manifestPath}', 'cli.template_manifest_missing', 'Missing template.manifest.json: {path}'],
  ['template.manifest.json 校验失败', 'cli.template_manifest_validation_failed', 'template.manifest.json validation failed'],
  ['manifest.id (${manifest.id}) 与模板 id (${ref.id}) 不一致', 'cli.template_manifest_id_mismatch', 'manifest.id ({manifestId}) does not match template id ({templateId})'],
  ['本地模板 ${manifest.id} 不支持 runtime ${runtime}', 'cli.local_template_runtime_unsupported', 'Local template {templateId} does not support runtime {runtime}'],
  ['未登录，无法请求封面 SSE', 'cli.cover_sse_login_required', 'Not logged in; cannot request cover SSE'],
  ['封面 SSE HTTP ${response.status}', 'cli.cover_sse_http_error', 'Cover SSE HTTP {status}'],
  ['封面 SSE body 不可读', 'cli.cover_sse_body_unreadable', 'Cover SSE body unreadable'],
  ['无法读取 PNG 尺寸', 'cli.png_dimensions_unreadable', 'Cannot read PNG dimensions'],
  ['无法读取 GIF 尺寸', 'cli.gif_dimensions_unreadable', 'Cannot read GIF dimensions'],
  ['无法读取 JPEG 尺寸', 'cli.jpeg_dimensions_unreadable', 'Cannot read JPEG dimensions'],
  ['不支持的封面格式: ${ext}', 'cli.unsupported_cover_format', 'Unsupported cover format: {ext}'],
  ['policy-map 包含未声明的依赖资源: ${entry.resourceId}', 'cli.policy_map_undeclared_dep', 'policy-map contains undeclared dependency: {resourceId}'],
  ['policy-map 重复声明依赖资源: ${entry.resourceId}', 'cli.policy_map_duplicate_dep', 'policy-map duplicate dependency: {resourceId}'],
  ['policy-map 重复声明策略: ${entry.resourceId}/${policyId}', 'cli.policy_map_duplicate_policy', 'policy-map duplicate policy: {resourceId}/{policyId}'],
  ['依赖资源不存在策略: ${entry.resourceId}/${policyId}', 'cli.dep_policy_not_found', 'Dependency has no policy: {resourceId}/{policyId}'],
  ['依赖策略未启用: ${entry.resourceId}/${policyId}', 'cli.dep_policy_not_enabled', 'Dependency policy not enabled: {resourceId}/{policyId}'],
  ['无法确认依赖策略是否需要支付: ${entry.resourceId}/${policyId}', 'cli.dep_policy_payment_unknown', 'Cannot confirm if dependency policy requires payment: {resourceId}/{policyId}'],
  ['依赖策略需要支付，CLI 不执行支付: ${entry.resourceId}/${policyId}', 'cli.dep_policy_payment_required', 'Dependency policy requires payment; CLI does not process payments: {resourceId}/{policyId}'],
  ['policy-map 不存在: ${filePath}', 'cli.policy_map_not_found', 'policy-map not found: {path}'],
  ['无法解析 policy-map（需 yaml/json）', 'cli.policy_map_parse_failed', 'Cannot parse policy-map (expected yaml/json)'],
  ['policy-map schema 非法', 'cli.policy_map_schema_invalid', 'policy-map schema invalid'],
  ['依赖授权未完成', 'cli.dep_auth_incomplete', 'Dependency authorization incomplete'],
  ['签约后无法验证依赖授权，不能确认签约成功', 'cli.dep_auth_verify_failed', 'Cannot verify dependency authorization after signing'],
  ['部分依赖签约失败', 'cli.dep_sign_partial_failed', 'Some dependency signings failed'],
  ['缺少依赖 resourceId', 'cli.missing_dep_resource_id', 'Missing dependency resourceId'],
  ['未找到依赖 ${opts.resourceId}', 'cli.dep_not_found', 'Dependency not found: {resourceId}'],
  ['无法读取平台依赖树', 'cli.dep_tree_unreadable', 'Cannot read platform dependency tree'],
  ['manifest.version.videoCover 是本地路径，draft push 需要 --upload 才能上传封面', 'cli.draft_video_cover_local_path', 'manifest.version.videoCover is a local path; draft push requires --upload to upload cover'],
  ['无平台发版草稿', 'cli.no_platform_draft', 'No platform release draft'],
  ['${label} 返回空 data', 'cli.api_label_empty_data', '{label} returned empty data'],
  ['文件属性解析失败: ${error}', 'cli.file_property_parse_failed', 'File property parse failed: {error}'],
  ['目录不存在: ${dir}', 'cli.directory_not_found', 'Directory not found: {dir}'],
  ['目录内无可用扁平文件', 'cli.no_flat_files_in_dir', 'No usable flat files in directory'],
  ['批量文件不存在或不是文件: ${absolutePath}', 'cli.batch_file_not_found', 'Batch file not found or not a file: {path}'],
  ['批量导入缺少 resourceTypeCode', 'cli.batch_missing_resource_type', 'Batch import missing resourceTypeCode'],
  ['${label} 必须是对象', 'cli.label_must_be_object', '{label} must be an object'],
  ['${label} 必须是字符串数组', 'cli.label_must_be_string_array', '{label} must be a string array'],
  ['${label}[${index}] 缺少 policyName/policyText', 'cli.label_item_missing_policy_fields', '{label}[{index}] missing policyName/policyText'],
  ['${label}[${index}].status 只能是 0 或 1', 'cli.label_item_status_invalid', '{label}[{index}].status must be 0 or 1'],
  ['${label} 必须是数组', 'cli.label_must_be_array', '{label} must be an array'],
  ['${label}[${index}] 需要 resourceId 与 policyIds', 'cli.label_item_missing_dep_fields', '{label}[{index}] requires resourceId and policyIds'],
  ['items[${index}].filePath 必填', 'cli.batch_item_filepath_required', 'items[{index}].filePath is required'],
  ['batch config.items 必须是数组', 'cli.batch_items_must_be_array', 'batch config.items must be an array'],
  ['batch config.items 没有可导入项目', 'cli.batch_items_empty', 'batch config.items has no importable items'],
  ['批量配置不存在: ${configFile}', 'cli.batch_config_not_found', 'Batch config not found: {path}'],
  ['批量配置必须是合法 JSON/YAML', 'cli.batch_config_invalid', 'Batch config must be valid JSON/YAML'],
  ['createBatch 响应格式异常', 'cli.create_batch_response_invalid', 'createBatch response format invalid'],
  ['generateResourceNames 响应格式异常', 'cli.generate_names_response_invalid', 'generateResourceNames response format invalid'],
  ['generateResourceNames 响应缺少 newResourceName', 'cli.generate_names_missing_name', 'generateResourceNames response missing newResourceName'],
  ['create 失败: ${item.filename}', 'cli.batch_create_failed', 'create failed: {filename}'],
  ['登录信息缺少 username', 'cli.auth_missing_username', 'Login info missing username'],
  ['createBatch 未返回第 ${i + 1} 项 resourceId', 'cli.create_batch_missing_resource_id', 'createBatch did not return resourceId for item {index}'],
  ['没有可用模板', 'cli.no_templates_available', 'No templates available'],
  ['已取消模板选择', 'cli.cancelled_template_pick', 'Template selection cancelled'],
  ['已取消 namespace 输入', 'cli.cancelled_namespace_input', 'Namespace input cancelled'],
  ['已取消资源信息输入', 'cli.cancelled_resource_info_input', 'Resource info input cancelled'],
  ['非交互 init 必须提供 --resource-type 或使用 init theme|widget|package', 'cli.non_interactive_init_needs_type', 'Non-interactive init requires --resource-type or init theme|widget|package'],
  ['非交互 init 缺少 --template', 'cli.non_interactive_init_needs_template', 'Non-interactive init missing --template'],
  ['非交互 init 缺少 --namespace', 'cli.non_interactive_init_needs_namespace', 'Non-interactive init missing --namespace'],
  ['未登录，无法请求 SSE meta', 'cli.meta_sse_login_required', 'Not logged in; cannot request SSE meta'],
  ['策略文件不存在: ${filePath}', 'cli.policy_file_not_found', 'Policy file not found: {path}'],
  ['policy.json 不是合法 JSON', 'cli.policy_json_invalid', 'policy.json is not valid JSON'],
  ['policy.json 校验失败（policyName 2–20、policyText 非空）', 'cli.policy_json_validation_failed', 'policy.json validation failed (policyName 2–20, policyText non-empty)'],
  ['已上架资源不能停用最后一条启用策略', 'cli.cannot_disable_last_policy', 'Cannot disable the last enabled policy on an online resource'],
  ['配置中未指定 filePath（需压缩的资源类型）', 'cli.config_missing_filepath_compress', 'filePath not specified in config (compression required for this resource type)'],
  ['文件路径不存在: ${versionConfig.filePath}', 'cli.version_filepath_not_found', 'File path not found: {path}'],
  ['配置中未指定 filename，且 filePath 为空', 'cli.config_missing_filename_and_filepath', 'filename not specified and filePath is empty in config'],
  ['filePath 是目录时须指定 filename（非压缩类型）', 'cli.filepath_dir_needs_filename', 'filename required when filePath is a directory (non-compression type)'],
  ['filePath 应该是文件路径（不需要压缩的资源类型）: ${filePath}', 'cli.filepath_must_be_file', 'filePath must be a file path (non-compression resource type): {path}'],
  ['无法从 ${latestVersion} 计算 bump 版本', 'cli.bump_version_compute_failed', 'Cannot compute bump version from {version}'],
  ['版本 ${version} 已存在，不能重复发行', 'cli.version_already_exists', 'Version {version} already exists; cannot publish again'],
  ['manifest.version 缺少 version', 'cli.manifest_version_missing', 'manifest.version missing version'],
  ['manifest.version 缺少 filePath', 'cli.manifest_filepath_missing', 'manifest.version missing filePath'],
  ['资源已冻结，无法 publish', 'cli.resource_frozen_cannot_publish', 'Resource is frozen; cannot publish'],
  ['主题/插件发布必须指定 runtimeVersion（0.4|0.5）', 'cli.theme_widget_runtime_required', 'Theme/widget publish requires runtimeVersion (0.4|0.5)'],
  ['无法校验依赖授权（authTree 失败），存在本地 dependencies 时拒绝 publish', 'cli.publish_dep_auth_tree_failed', 'Cannot verify dependency authorization (authTree failed); publish rejected with local dependencies'],
  ['资源缺少 resourceTypeCode，无法解析文件属性', 'cli.missing_type_for_file_properties', 'Resource missing resourceTypeCode; cannot resolve file properties'],
  ['登录信息缺少 username，无法创建资源', 'cli.auth_missing_username_for_create', 'Login info missing username; cannot create resource'],
  ['本地已有 resourceId，勿重复 create', 'cli.resource_already_exists', 'Local resourceId already exists; do not create again'],
  ['缺少资源标题', 'naming_convention_resource_title_required', 'Please enter a title'],
  ['缺少资源类型 resourceTypeCode', 'naming_convention_resource_type_required', 'Please select a resource type'],
  ['授权标识已存在: ${toFullResourceName(username, name)}', 'resource_name_exist', '{authID} already exists.'],
  ['create 响应缺少 resourceId', 'cli.create_missing_resource_id', 'create response missing resourceId'],
  ['该资源类型不支持自定义属性', 'cli.type_no_custom_properties', 'This resource type does not support custom properties'],
  ['该资源类型不支持 CLI 本地文件上传', 'cli.type_no_local_upload', 'This resource type does not support CLI local file upload'],
  ['文件格式不符合资源类型要求: ${opts.filename}', 'cli.file_format_not_allowed', 'File format does not meet resource type requirements: {filename}'],
  ['文件大小超过资源类型限制', 'cli.file_size_exceeds_type_limit', 'File size exceeds resource type limit'],
  ['平台未返回可用资源类型', 'cli.no_resource_types_from_platform', 'Platform did not return available resource types'],
  ['已取消资源类型选择', 'cli.cancelled_resource_type_pick', 'Resource type selection cancelled'],
  ['选择的资源类型不存在', 'cli.selected_resource_type_not_found', 'Selected resource type does not exist'],
  ['项目目录名不能为空', 'cli.project_dir_name_empty', 'Project directory name cannot be empty'],
  ['项目名称只能包含英文、数字、下划线和横杠', 'cli.project_name_invalid_chars', 'Project name may only contain letters, numbers, underscores, and hyphens'],
  ['资源短授权标识只能包含英文、数字、下划线和横杠', 'cli.auth_id_invalid_chars', 'Short auth ID may only contain letters, numbers, underscores, and hyphens'],
  ['目录已初始化: ${projectDir}', 'cli.dir_already_initialized', 'Directory already initialized: {dir}'],
  ['目录已绑定平台资源，拒绝 init 覆盖: ${projectDir}', 'cli.dir_bound_refuse_init', 'Directory bound to platform resource; init overwrite refused: {dir}'],
  ['目录非空，不能复制模板: ${projectDir}', 'cli.dir_not_empty_cannot_copy_template', 'Directory not empty; cannot copy template: {dir}'],
  ['${pm} install 失败 (exit ${code})', 'cli.pm_install_failed', '{pm} install failed (exit {code})'],
  ['npm pack ${ref.npmName}@${ref.version} 失败', 'cli.npm_pack_failed', 'npm pack {name}@{version} failed'],
  ['npm pack 未产出 tarball: ${ref.npmName}@${ref.version}', 'cli.npm_pack_no_tarball', 'npm pack produced no tarball: {name}@{version}'],
  ['解压模板 tarball 失败', 'cli.template_tarball_extract_failed', 'Failed to extract template tarball'],
  ['未能获取模板 ${ref.npmName}@${ref.version}', 'cli.template_fetch_failed', 'Failed to fetch template {name}@{version}'],
  ['init 必须提供 --resource-type <resourceTypeCode>', 'cli.init_resource_type_required', 'init requires --resource-type <resourceTypeCode>'],
  ['缺少 --template', 'cli.missing_template_flag', 'Missing --template'],
  ['前端库脚手架需要 --namespace', 'cli.frontend_scaffold_needs_namespace', 'Frontend library scaffold requires --namespace'],
  ['当前 CLI 不支持运行时档 0.4', 'cli.runtime_04_not_supported', 'Current CLI does not support runtime 0.4'],
  ['平台未返回资源信息', 'cli.platform_no_resource_info', 'Platform did not return resource info'],
  ['平台 listing 与本地 manifest.resource 均有变更', 'cli.listing_and_local_both_changed', 'Both platform listing and local manifest.resource have changes'],
  ['本地无 resourceId，请先 create 或 pull', 'cli.no_local_resource_id', 'No local resourceId; run create or pull first'],
  ['无法比对 Owner（缺少 userId）', 'cli.owner_compare_missing_user_id', 'Cannot compare Owner (missing userId)'],
  ['本地与平台资源信息不一致', 'cli.resource_info_mismatch', 'Local and platform resource info differ'],
  ['无法 pull：缺少 resourceId / resourceName', 'cli.pull_missing_id', 'Cannot pull: missing resourceId / resourceName'],
  ['无权 pull 他人资源到本地写缓存（Owner 不符）', 'cli.pull_owner_denied', "Cannot pull another user's resource to local cache (owner mismatch)"],
  ['缺少 resourceTypeCode', 'cli.missing_resource_type_code', 'Missing resourceTypeCode'],
  ['未知资源类型 code: ${code}', 'cli.unknown_resource_type_code', 'Unknown resource type code: {code}'],
  ['标签数量不能超过 ${FIELD_LIMITS.tagsMaxCount}', 'cli.tags_count_exceeds_max', 'Tag count must not exceed {max}'],
  ['标签不能为空字符串', 'cli.tag_empty', 'Tag cannot be an empty string'],
  ['单个标签长度不能超过 ${FIELD_LIMITS.tagMaxLength}', 'cli.tag_length_exceeds_max', 'Single tag length must not exceed {max}'],
  ['至少提供 --description、--video-cover 或 --sync-properties 之一', 'cli.version_edit_at_least_one_field', 'Provide at least one of --description, --video-cover, or --sync-properties'],
  ['新版本必须大于平台最新版 ${latestVersion}', 'freelog_versioning', 'Version number should follow the Semantic Versioning Specification.'],
];

const PARAM_MAP = {
  'String(args.keyword)': 'keyword: String(args.keyword)',
  filePath: 'path: filePath',
  absolute: 'path: absolute',
  absDir: 'dir: absDir',
  absMedia: 'dir: absMedia',
  'local.resourceId': 'resourceId: local.resourceId',
  'desc.type': 'type: desc.type',
  'opts.templateId': 'templateId: opts.templateId',
  'opts.resourceId': 'resourceId: opts.resourceId',
  'entry.resourceId': 'resourceId: entry.resourceId',
  policyId: 'policyId',
  'response.status': 'status: response.status',
  ext: 'ext',
  'opts.filename': 'filename: opts.filename',
  dir: 'dir',
  absolutePath: 'path: absolutePath',
  configFile: 'path: configFile',
  'item.filename': 'filename: item.filename',
  'i + 1': 'index: i + 1',
  latestVersion: 'version: latestVersion',
  version: 'version',
  code: 'code',
  'FIELD_LIMITS.tagsMaxCount': 'max: FIELD_LIMITS.tagsMaxCount',
  'FIELD_LIMITS.tagMaxLength': 'max: FIELD_LIMITS.tagMaxLength',
  projectDir: 'dir: projectDir',
  pm: 'pm',
  'ref.npmName': 'name: ref.npmName',
  'ref.version': 'version: ref.version',
  'manifest.id': 'manifestId: manifest.id',
  'ref.id': 'templateId: ref.id',
  manifestPath: 'path: manifestPath',
  file: 'file',
  index: 'index',
  label: 'label',
  runtime: 'runtime',
  error: 'error: String(error)',
  'toFullResourceName(username, name)': 'authID: toFullResourceName(username, name)',
};

const ZH_PARAM_MAP = {
  'String(args.keyword)': '{keyword}',
  filePath: '{path}',
  absolute: '{path}',
  absDir: '{dir}',
  absMedia: '{dir}',
  'local.resourceId': '{resourceId}',
  'desc.type': '{type}',
  'opts.templateId': '{templateId}',
  'opts.resourceId': '{resourceId}',
  'entry.resourceId': '{resourceId}',
  policyId: '{policyId}',
  'response.status': '{status}',
  ext: '{ext}',
  'opts.filename': '{filename}',
  dir: '{dir}',
  absolutePath: '{path}',
  configFile: '{path}',
  'item.filename': '{filename}',
  'i + 1': '{index}',
  latestVersion: '{version}',
  version: '{version}',
  code: '{code}',
  'FIELD_LIMITS.tagsMaxCount': '{max}',
  'FIELD_LIMITS.tagMaxLength': '{max}',
  projectDir: '{dir}',
  pm: '{pm}',
  'ref.npmName': '{name}',
  'ref.version': '{version}',
  'manifest.id': '{manifestId}',
  'ref.id': '{templateId}',
  manifestPath: '{path}',
  file: '{file}',
  index: '{index}',
  label: '{label}',
  runtime: '{runtime}',
  error: '{error}',
  'toFullResourceName(username, name)': '{authID}',
};

function zhFromTemplate(template) {
  return template.replace(/\$\{([^}]+)\}/g, (_, inner) => ZH_PARAM_MAP[inner] || `{${inner}}`);
}

function paramsFromTemplate(template) {
  const matches = [...template.matchAll(/\$\{([^}]+)\}/g)];
  if (!matches.length) return null;
  const parts = matches.map((m) => PARAM_MAP[m[1]] || m[1]);
  return `{ ${parts.join(', ')} }`;
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function findMatchingBrace(s, openIdx) {
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseStringLiteral(s, start) {
  const q = s[start];
  if (q !== '`' && q !== "'" && q !== '"') return null;
  let i = start + 1;
  let out = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      out += s[i + 1];
      i += 2;
      continue;
    }
    if (c === q) return { value: out, end: i + 1 };
    out += c;
    i++;
  }
  return null;
}

function ensureImports(content, file) {
  if (content.includes("from '../i18n/cliError") || content.includes('from "../i18n/cliError')) return content;
  const relCli = path.relative(path.dirname(file), path.join(srcRoot, 'i18n/cliError.js')).replace(/\\/g, '/');
  const relBundled = path.relative(path.dirname(file), path.join(srcRoot, 'i18n/bundled.js')).replace(/\\/g, '/');
  const imp = `import { cliError } from '${relCli}';\nimport { I18N_KEYS } from '${relBundled}';\n`;
  const lines = content.split('\n');
  let lastImportEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) lastImportEnd = i;
    else if (lastImportEnd > 0 && lines[i].trim() !== '' && !lines[i].startsWith('import ')) break;
  }
  if (lastImportEnd === 0) return imp + content;
  lines.splice(lastImportEnd + 1, 0, imp.trimEnd());
  return lines.join('\n');
}

// Build lookup
const lookup = new Map();
for (const [template, jsonKey, en] of ENTRIES) {
  lookup.set(template, { jsonKey, en, tsKey: tsKeyFromJsonKey(jsonKey) });
}

// Update bundled-data.json
const bundled = JSON.parse(fs.readFileSync(bundledDataPath, 'utf8'));
for (const [template, jsonKey, en] of ENTRIES) {
  if (jsonKey.startsWith('cli.') && !bundled[jsonKey]) {
    bundled[jsonKey] = { zh_CN: zhFromTemplate(template), en_US: en };
  }
}
for (const [k, v] of Object.entries({
  brr_resourcelisting_complete_confirm_msg: { zh_CN: '确认完成资源列表？', en_US: 'Confirm resource listing is complete?' },
  additem_alert_qtylimit: { zh_CN: '已达到数量上限', en_US: 'Quantity limit reached' },
})) {
  if (!bundled[k]) bundled[k] = v;
}
fs.writeFileSync(bundledDataPath, `${JSON.stringify(bundled, null, 2)}\n`);

// Update bundled.ts
let bundledTs = fs.readFileSync(bundledTsPath, 'utf8');
const toAdd = [];
for (const [, jsonKey] of ENTRIES) {
  const tsKey = tsKeyFromJsonKey(jsonKey);
  if (!bundledTs.includes(`${tsKey}:`)) toAdd.push(`  ${tsKey}: '${jsonKey}',`);
}
for (const k of ['brr_resourcelisting_complete_confirm_msg', 'additem_alert_qtylimit']) {
  if (!bundledTs.includes(`${tsKeyFromJsonKey(k)}:`)) toAdd.push(`  ${tsKeyFromJsonKey(k)}: '${k}',`);
}
if (toAdd.length) {
  bundledTs = bundledTs.replace(/\n\} as const;/, `\n${[...new Set(toAdd)].join('\n')}\n} as const;`);
  fs.writeFileSync(bundledTsPath, bundledTs);
}

const skip = new Set([
  path.join(srcRoot, 'core/errors.ts'),
  path.join(srcRoot, 'i18n/cliError.ts'),
]);

let totalReplacements = 0;
for (const file of walk(srcRoot)) {
  if (skip.has(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('throw new CliError')) continue;
  let changed = false;

  let idx = 0;
  while (true) {
    const throwIdx = content.indexOf('throw new CliError(', idx);
    if (throwIdx === -1) break;
    let msgStart = throwIdx + 'throw new CliError('.length;
    while (content[msgStart] && /\s/.test(content[msgStart])) msgStart++;
    const parsed = parseStringLiteral(content, msgStart);
    if (!parsed) {
      idx = throwIdx + 'throw new CliError('.length;
      continue;
    }
    const template = parsed.value;
    const cfg = lookup.get(template);
    if (!cfg) {
      idx = throwIdx + 'throw new CliError('.length;
      continue;
    }
    // find options object
    let pos = parsed.end;
    while (content[pos] && /[\s,]/.test(content[pos])) pos++;
    if (content[pos] !== '{') {
      idx = throwIdx + 'throw new CliError('.length;
      continue;
    }
    const optEnd = findMatchingBrace(content, pos);
    if (optEnd === -1) {
      idx = throwIdx + 1;
      continue;
    }
    const options = content.slice(pos, optEnd + 1);
    const params = paramsFromTemplate(template);
    let newOptions = options;
    if (params) {
      if (options.includes('params:')) {
        // merge not supported — skip
      } else {
        newOptions = options.replace(/\{\s*$/, `{ params: ${params}, `);
      }
    }
    const replacement = `throw cliError(I18N_KEYS.${cfg.tsKey}, ${newOptions}`;
    content = content.slice(0, throwIdx) + replacement + content.slice(optEnd + 1);
    changed = true;
    totalReplacements++;
    idx = throwIdx + replacement.length;
  }

  if (changed) {
    content = ensureImports(content, file);
    fs.writeFileSync(file, content);
  }
}

console.log(`Replaced ${totalReplacements} CliError throws`);
console.log('Run pnpm i18n:audit to check remaining hits');
