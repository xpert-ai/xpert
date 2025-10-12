import { Project, SyntaxKind } from "ts-morph"
import path from "path"
import { fileURLToPath } from "url"

// --- 路径初始化 ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ✅ 源代码目录
const SRC_PATH = path.resolve(process.cwd(), "")

// ✅ 可配置的关系字段
const RELATION_FIELDS = ["tenant", "user", "organization"]

// ✅ 检查是否 dry-run 模式
const isDryRun = process.argv.includes("--dry-run")

console.log(`\n🔍 Scanning TypeORM "where" clauses in: ${SRC_PATH}`)
if (isDryRun) {
  console.log("🧪 Dry-run mode enabled (no file changes will be saved)")
}

// --- 初始化 ts-morph 项目 ---
const project = new Project({
  tsConfigFilePath: path.resolve(process.cwd(), "tsconfig.base.json"),
})

// 加载所有 .ts 文件
project.addSourceFilesAtPaths(`${SRC_PATH}/**/*.ts`)

let totalReplacements = 0
let modifiedFilesCount = 0

for (const file of project.getSourceFiles()) {
  const objectLiterals = file.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
  let fileChanged = false

  for (const obj of objectLiterals) {
    const text = obj.getText()

    // 仅匹配包含 where: { ... } 的对象
    if (!/where\s*:\s*\{/.test(text)) continue

    for (const prop of obj.getProperties()) {
      const propText = prop.getText()

      // 匹配 tenant: this.tenant, user: dto.user 等形式
      const match = new RegExp(
        `\\b(${RELATION_FIELDS.join("|")})\\s*:\\s*([\\w\\.]+)`,
        "g"
      ).exec(propText)

      if (match) {
        const [fullMatch, field, expr] = match
        const newText = propText.replace(fullMatch, `${field}Id: ${expr}.id`)

        // 文件与行号
        const sourceFile = prop.getSourceFile()
        const lineNumber = sourceFile.getLineAndColumnAtPos(prop.getStart()).line

        // 输出修改 diff
        console.log(
          `\n📄 ${path.relative(process.cwd(), sourceFile.getFilePath())}:${lineNumber}\n   - ${fullMatch}\n   + ${field}Id: ${expr}.id`
        )

        // dry-run 不修改文件
        if (!isDryRun) {
          prop.replaceWithText(newText)
        }

        totalReplacements++
        fileChanged = true
      }
    }
  }

  if (fileChanged) modifiedFilesCount++
}

if (!isDryRun) {
  await project.save()
}

console.log(
  `\n✅ Done! ${isDryRun ? "(dry-run)" : ""} Modified ${modifiedFilesCount} files, ${totalReplacements} replacements total.\n`
)
