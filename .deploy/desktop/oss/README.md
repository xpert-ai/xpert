# Bosi 国内分发配置

GitHub 发布正式版后，`Build Bosi Desktop apps` 会调用 `Mirror Bosi release to OSS`。手动补传与自动发布使用同一套校验。版本目录为 `bosi/desktop-vX.Y.Z/`，官网和桌面端共用 `bosi/latest.json`。

## 阿里云设置

1. Bosi 使用杭州（`cn-hangzhou`）的标准存储 Bucket `xpert-bosi-releases`。发布和客户端均使用 OSS 自带的 HTTPS 域名 `xpert-bosi-releases.oss-cn-hangzhou.aliyuncs.com`，证书由阿里云维护。其他账号部署时先验证默认域名支持数据读写；若 OSS 返回 `PublicEndpointForbidden`，需绑定已备案的自定义域名并配置 HTTPS。[OSS 访问域名说明](https://help.aliyun.com/zh/oss/oss-domain-names)
2. Bucket ACL 设为私有。用 Bucket Policy 授予匿名用户指定目录 `bosi/*` 的“只读（不包含 ListObject 操作）”。公共访问限制须允许该发布目录公开读取。若组织策略要求整个账号阻止公共访问，使用获准承载公开下载的账号。发布目录内只存公开的 Release 附件和索引。[OSS 自定义域名](https://help.aliyun.com/zh/oss/user-guide/access-buckets-via-custom-domain-names) · [Bucket Policy](https://help.aliyun.com/zh/oss/user-guide/oss-bucket-policy/)
3. 在 Bucket 跨域设置中添加来源 `https://xpertai.cn`，以及实际提供页面的其他官网 origin，允许 `GET`、`HEAD`。安装器和 CI 会发起无 Referer 请求。域名应支持匿名 HTTPS、Range GET 以及无 Referer 访问。
4. 在 RAM 创建 OIDC 身份提供商，issuer 为 `https://token.actions.githubusercontent.com`，受众为 `sts.aliyuncs.com`。为 GitHub 创建角色，允许一小时会话。信任策略示例如下，替换尖括号字段。[RAM 信任策略](https://help.aliyun.com/en/ram/user-guide/create-a-ram-role-for-a-trusted-idp) · [阿里云官方 GitHub Action](https://github.com/aliyun/configure-aliyun-credentials-action)

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Principal": { "Federated": ["acs:ram::<账号ID>:oidc-provider/<提供商名称>"] },
      "Condition": {
        "StringEquals": {
          "oidc:iss": "https://token.actions.githubusercontent.com",
          "oidc:aud": "sts.aliyuncs.com",
          "oidc:sub": "repo:xpert-ai/xpert:environment:bosi-oss"
        }
      }
    }
  ]
}
```

给该角色关联以下 RAM 权限策略。文件上传、校验和索引更新只使用该 Bucket 的发布目录。

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:GetObject", "oss:PutObject"],
      "Resource": ["acs:oss:*:<账号ID>:<Bucket名称>/bosi/*"]
    }
  ]
}
```

大安装包按 2 MiB 分片上传，每个文件最多同时传输 8 个分片。传输中断时，工作流最多尝试受影响的分片 4 次，并定期输出已完成分片和字节数。全部文件上传并校验后才更新公开索引。
如需在任务失败时立即清理未合并的分片，发布角色可在同一目录增加 `oss:AbortMultipartUpload`；也可由 Bucket 生命周期规则定期清理未完成的分片。

## GitHub Actions 设置

在两个仓库的 **Settings → Secrets and variables → Actions → Variables** 设置仓库变量 `BOSI_OSS_DOMAIN`。填写相同的小写域名 `xpert-bosi-releases.oss-cn-hangzhou.aliyuncs.com`。桌面打包任务和官网构建任务都在 environment 之外读取它。官网建议在首次补传后启用。

在 `xpert-ai/xpert` 的 **Settings → Environments** 创建 `bosi-oss`，Deployment branches 只允许 `main`，添加以下 Environment variables。

| 名称                         | 值                                |
| ---------------------------- | --------------------------------- |
| `BOSI_OSS_BUCKET`            | 实际 Bucket 名称                  |
| `BOSI_OSS_REGION`            | 阿里云地域 ID，例如 `cn-hangzhou` |
| `BOSI_OSS_OIDC_PROVIDER_ARN` | RAM OIDC 提供商的完整 ARN         |
| `BOSI_OSS_ROLE_ARN`          | 上述 RAM 发布角色的完整 ARN       |

发布使用 GitHub OIDC 换取临时凭证。官网和客户端只持有公开域名。

## 同步任务与超时预算

工作流按整个发布串行排队，防止不同版本同时修改索引；同一发布内按文件并行上传：

1. **prepare（20 分钟）**：从 GitHub 下载完整 Release，校验附件 SHA-256、大小和 `SHA256SUMS.txt`，生成包含 MD5、CRC64 的校验快照。此阶段不获取 OSS 凭据。快照作为当前 run 的 artifact 保留 30 天，后续任务只接受与快照完全一致的文件。
2. **upload（每个文件 50 分钟，最多 3 个任务并行）**：每个超过 2 MiB 的附件独占一个矩阵任务，下载并核对该文件后才获取新的 3600 秒 STS 凭据。每个任务都核对 OSS 的 SHA-256 元数据、服务端 CRC64、大小和公开 HEAD 响应。某个文件失败不会取消其他上传。
3. **finalize（15 分钟）**：所有上传成功后，独立获取新凭据，补齐不超过 2 MiB 的小文件，再次核对所有远端附件后才更新 `latest.json`，并检查公开索引和官网 CORS。此任务不会兜底上传缺失的大文件；任一文件缺失、损坏或不可公开访问都会阻止索引切换。没有大文件时可直接进入此阶段。

因此完整发布耗时不再受单个任务的一小时凭据限制，也不需要延长 RAM 会话或扩大 OSS 权限。单文件仍有 50 分钟预算，极慢网络或服务故障仍可能失败。

失败时优先使用 **Re-run failed jobs**。上传任务和最终校验复用同一份快照，已完成且校验一致的对象不会重复上传或覆盖。快照已过期时使用 **Re-run all jobs** 或按同一 tag 新建运行。未完成分片合并的文件会重新上传；旧版补传不会使最新版本或各架构更新源倒退。

## 首次上线与验收

### 隔离的全量上传实测

手动运行时启用 `benchmark`，用已经发布并同步的版本验证真实上传吞吐：

```bash
gh workflow run desktop-oss.yml --repo xpert-ai/xpert --ref main -f tag=desktop-v0.5.3 -f benchmark=true
```

实测复用正式上传实现、3 路文件并行、2 MiB 分片、每个文件独立的 3600 秒凭据和 50 分钟预算。所有文件写入 `bosi/_benchmarks/<GitHub run ID>/desktop-vX.Y.Z/`，路径不能由输入指定。prepare 确认目标文件均不存在，并保存正式版本文件的 ETag、修改时间、大小、SHA-256 元数据、CRC64，以及 `bosi/latest.json` 的内容哈希和元数据。最终校验临时文件后，再比较正式文件及索引的前后快照；实测模式禁止发布索引。

各文件日志中的 JSON 包含 `uploaded`、字节数和 `elapsed_seconds`，可结合 GitHub job/凭据步骤的时间核对是否确实全量上传及每个会话的余量。快照和结果保存在当前 run 的 artifact 中，保留 30 天。新的全量测量应新建 workflow run；失败任务可以原地重跑，但需要结合所有 attempts 的记录区分首次上传和复用。

成功验证后只清理本次临时目录中清单列出的文件，再次检查正式文件和索引。若发布角色没有 `oss:DeleteObject` 权限，会明确记录 `cleanup: permission-denied` 并保留临时目录，供有权限的管理员清理；不会自动扩大角色权限。该目录也可由 Bucket 生命周期规则清理。

### 正式发布验收

1. 发布工作流合入 `xpert-ai/xpert:main` 后，进入 **Actions → Mirror Bosi release to OSS → Run workflow**，选择 `main`，填写已经公开的正式 tag，例如 `desktop-v0.4.1`。也可使用以下命令。

   ```bash
   gh workflow run desktop-oss.yml --repo xpert-ai/xpert --ref main -f tag=desktop-v0.4.1
   ```

2. 工作流核对所有附件的 GitHub SHA-256、大小和发布校验清单，逐个确认 OSS 对象可匿名访问，最后发布索引并验证官网 origin 的匿名读取与 CORS。传输中断时重新运行相同 tag。已传附件会被复核，内容冲突会报错。索引保留每个架构最近的可更新版本。
3. 从国内网络检查索引、官网的 CORS 响应，以及真实安装包的断点下载。将命令中的示例域名和版本替换为上线值。

   ```bash
   curl -fsS -D - -H 'Origin: https://xpertai.cn' https://xpert-bosi-releases.oss-cn-hangzhou.aliyuncs.com/bosi/latest.json
   curl -fsS --range 0-0 -D - -o /dev/null https://xpert-bosi-releases.oss-cn-hangzhou.aliyuncs.com/bosi/desktop-v0.4.1/Bosi-0.4.1-win-x64.exe
   ```

   预期索引返回 200 和适用于官网 origin 的 `Access-Control-Allow-Origin`，安装包返回 206 和 `Content-Range`。也可从同目录下载 `SHA256SUMS.txt` 核对完整的安装包。

4. 设置官网变量后发布 `xpert-ai/xpert-website` 的 **Validate and release website**，检查中英文下载页以及首页和导航的下载按钮。官网会从 OSS 读取后续版本，无需逐版重新构建。
5. 按既有 Changesets 流程发下一版 Bosi 客户端。旧客户端继续使用发布时写入的地址，GitHub 不可达的用户从官网手动安装带国内更新源的首版。之后在已安装的受支持客户端上使用“检查更新”验证下一个正式版本。macOS 更新沿用原有签名要求，Linux 自动更新适用于 AppImage。
