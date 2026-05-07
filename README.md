# CV company AIチャットボット — デプロイ手順

## フォルダ構成
```
cv-chatbot/
├── api/
│   └── chat.js        ← APIキーを安全に管理するサーバー
├── public/
│   └── index.html     ← チャットボット本体
├── vercel.json        ← Vercel設定
└── README.md
```

## デプロイ手順

### Step 1: GitHubにアップロード
1. https://github.com でリポジトリを新規作成
2. このフォルダの中身を丸ごとアップロード

### Step 2: Vercelでデプロイ
1. https://vercel.com にGitHubアカウントでログイン
2. 「New Project」→ リポジトリを選択 →「Deploy」

### Step 3: APIキーを設定（重要）
1. Vercel プロジェクト画面 →「Settings」→「Environment Variables」
2. 以下を入力して「Save」
   - Name:  ANTHROPIC_API_KEY
   - Value: sk-ant-api03-xxxx...（Anthropic Consoleで取得）
3. 「Deployments」タブ → 最新のデプロイの「…」→「Redeploy」

### APIキーの取得方法
1. https://console.anthropic.com にアクセス
2. 「API Keys」→「Create Key」
3. 発行されたキー（sk-ant-...）をコピー

## 既存サイトへの埋め込み
```html
<iframe
  src="https://あなたのプロジェクト名.vercel.app"
  width="380" height="640"
  frameborder="0"
  style="position:fixed; bottom:20px; right:20px;
         border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.15);
         z-index:9999;">
</iframe>
```
