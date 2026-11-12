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

## 首次上线与验收

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
