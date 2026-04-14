# Dexter US: Cloud Run APIサーバーとしてデプロイする

## 概要

dexter-jp と同じ方式で、オリジナルの dexter を Cloud Run にデプロイする。
stock-agent のチャット機能から `/query` エンドポイントを呼び出して使う。

## 参考: dexter-jp の構成

dexter-jp は以下の変更を加えて EDINET DB 対応 + API サーバー化している:
- `src/api/server.ts` — Bun HTTP サーバー（POST /query, GET /health）
- `src/api/run-agent.ts` — ステートレスなエージェント実行
- `Dockerfile` — `bun run src/api/server.ts` で起動
- データソース: EDINET DB API (`edinetdb.jp`)
- 認証: `X-API-Key` ヘッダー

## やること

### 1. API サーバーの追加

dexter-jp から以下のファイルをコピーして適用する（エージェントのコア部分はそのまま、APIラッパーだけ追加）:

```
src/api/server.ts    — HTTP サーバー（POST /query, GET /health）
src/api/run-agent.ts — エージェントのワンショット実行
```

**server.ts のポイント:**
- `POST /query` — `{ query: string, model?: string, maxIterations?: number }` を受け取る
- `GET /health` — ヘルスチェック
- ポート: `process.env.PORT || 8080`

**run-agent.ts のポイント:**
- dexter のエージェントループを1回実行して結果テキストを返す
- セッション管理なし（ステートレス）

### 2. Dockerfile の追加

```dockerfile
FROM oven/bun:1-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json bun.lock ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun install --frozen-lockfile --production

COPY . .

EXPOSE 8080
CMD ["bun", "run", "src/api/server.ts"]
```

### 3. モデルの変更

dexter-jp は Claude (Anthropic) を使っている。オリジナルの dexter は OpenAI (`gpt-5.4`) がデフォルト。

**Claude に変更する:**
- `ANTHROPIC_API_KEY` 環境変数を設定
- デフォルトモデルを `claude-sonnet-4-20250514` に変更
- `src/agent/` 内のモデル設定を確認して変更

### 4. 環境変数

```bash
# 必須
ANTHROPIC_API_KEY=your-anthropic-api-key          # Claude API キー
FINANCIAL_DATASETS_API_KEY=your-financial-datasets-api-key  # Financial Datasets API キー

# オプション
EXASEARCH_API_KEY=...                 # Web 検索
PORT=8080                             # サーバーポート
```

### 5. データソースの確認

オリジナルの dexter は Financial Datasets API (`financialdatasets.ai`) を使用:
- 米国株の株価、財務諸表、SEC Filing
- アナリスト予想、インサイダー取引
- `x-api-key` ヘッダーで認証

これらはそのまま使えるので、ツールの変更は不要。

### 6. Cloud Run へのデプロイ

dexter-jp と同じ方式（ソースデプロイ）:

```bash
gcloud run deploy dexter-us \
  --source . \
  --project stock-agent-dev \
  --region asia-northeast1 \
  --port 8080 \
  --memory 1Gi \
  --timeout 300 \
  --set-env-vars="ANTHROPIC_API_KEY=your-anthropic-api-key,FINANCIAL_DATASETS_API_KEY=your-financial-datasets-api-key" \
  --no-allow-unauthenticated
```

`--no-allow-unauthenticated` にすることで、stock-agent の Cloud Run SA からのみアクセス可能にする。

### 7. IAM 設定

stock-agent のサーバー SA に dexter-us の invoker 権限を付与（Terraform で管理）:

```hcl
resource "google_cloud_run_service_iam_member" "dexter_us_invoker" {
  project  = var.project_id
  location = var.region
  service  = "dexter-us"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.server.email}"
}
```

### 8. 動作確認

デプロイ後:

```bash
# ヘルスチェック
curl https://dexter-us-xxxx.run.app/health

# クエリテスト（認証トークン付き）
TOKEN=$(gcloud auth print-identity-token --impersonate-service-account=stock-agent-server@stock-agent-dev.iam.gserviceaccount.com --audiences=https://dexter-us-xxxx.run.app)

curl -X POST https://dexter-us-xxxx.run.app/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Analyze Apple (AAPL) as an investment target"}'
```

## stock-agent 側の設定

デプロイ完了後、stock-agent の env defaults に追加:

```go
DexterUSURL: "https://dexter-us-xxxx.run.app",
FinancialDatasetsAPIKey: "your-financial-datasets-api-key",
```

チャットの市場セレクトで「米国株」を選ぶと、このエンドポイントが使われる。
