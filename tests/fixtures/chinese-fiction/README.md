# 中文小说测试素材

该目录是一组可复用的中文小说测试素材，可供 IntentRouter、Agent、Skill 和 Workflow 专项测试共同使用，也可作为独立 Vinkey 工作区打开。

当前 `intent-router-eval-3` 套件包含 12 个输入用例，所有 `document` target 都引用本目录中的真实 `.txt` 文件。确定性路由和模型分类阶段只传相对路径，不传正文。

## 素材

| 文件 | 规模用途 | 来源 |
| --- | --- | --- |
| `短篇/孔乙己.txt` | 短文本、单文件 | 中文 Wikisource《孔乙己》 |
| `短篇/狂人日记.txt` | 中等文本、单文件 | 中文 Wikisource《狂人日記》 |
| `短篇/故乡.txt` | 中等文本、跨作品多文件 | 中文 Wikisource《故鄉》 |
| `中篇/阿Q正传.txt` | 较长文本、长文分类 | 中文 Wikisource《阿Q正傳》 |

四部作品作者均为鲁迅（1881-1936），来源页面标明作品在中国大陆及相关适用地区因保护期届满进入公有领域。仓库保存的是 Wikisource 简体中文渲染正文，抓取日期为 2026-09-17。逐文件来源 URL、字符数、字节数与 SHA-256 见 `manifest.json`。

## 重新生成

在仓库根目录安装依赖后运行：

```bash
npm run fixtures:chinese-fiction
```

该命令会联网读取 Wikisource，并覆盖四个 `.txt` 文件和 `manifest.json`。测试和日常构建直接使用仓库内已固定的文本，不会自动联网。

## 隐私边界

IntentRouter 的确定性测试只使用这些文件的相对路径、目标类型和数量，不读取正文。Agent、Skill 和 Workflow 测试可以按各自合同读取正文，但不应与路由分类准入混淆。
