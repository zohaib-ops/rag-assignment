# RAG Assignment - AI-Powered Document Query System

A Retrieval-Augmented Generation (RAG) application built with Express.js, LangChain, and OpenAI, featuring comprehensive observability through OpenTelemetry instrumentation.

## 🚀 Features

- **RAG Pipeline**: Document ingestion, vector storage, and intelligent querying
- **AI Integration**: OpenAI embeddings and chat completions
- **Vector Database**: PostgreSQL with pgvector for similarity search
- **Comprehensive Observability**: OpenTelemetry tracing with AI SDK instrumentation
- **Real-time Monitoring**: TestOps dashboard integration for trace visualization

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client        │───▶│  Express Server  │───▶│  PostgreSQL     │
│                 │    │  + OpenTelemetry │    │  + pgvector     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   OpenAI API     │
                       │   - Embeddings   │
                       │   - Chat Comp.   │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  TestOps         │
                       │  Dashboard       │
                       └──────────────────┘
```

## 📦 Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd rag-assignment
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Configure AI Provider**: The application supports multiple AI providers with automatic model selection:

   **For Anthropic (Claude) - Recommended:**
   ```env
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here  # Required for embeddings
   ```

   **For OpenAI (GPT):**
   ```env
   AI_PROVIDER=openai
   OPENAI_API_KEY=your_openai_api_key_here
   ```

5. **Complete Environment Variables:**
   ```env
   # AI Provider Selection ('openai' or 'anthropic')
   AI_PROVIDER=anthropic

   # API Keys
   OPENAI_API_KEY=your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key  # Only if using Anthropic

   # Database Configuration
   PG_HOST=localhost
   PG_USER=your_username
   PG_PASSWORD=your_password
   PG_DATABASE=your_database
   PG_PORT=5432

   # TestOps Configuration (Optional)
   TESTOPS_PUBLIC_KEY=your_testops_public_key
   TESTOPS_SECRET_KEY=your_testops_secret_key
   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:3000/api/public/otel/v1/traces
   ```

### 🤖 Supported AI Providers

| Provider | Chat Model | Embedding Model | Features |
|----------|------------|-----------------|----------|
| **Anthropic** | Claude 3.5 Sonnet | OpenAI ada-002 | Latest Claude model with superior reasoning |
| **OpenAI** | GPT-4 | text-embedding-ada-002 | Proven GPT-4 performance |

> **Note**: All providers currently use OpenAI's `text-embedding-ada-002` for document embeddings due to its proven performance in RAG applications. This requires an OpenAI API key even when using Anthropic for chat completion.

## 🛠️ Usage

### Start the Server
```bash
node server.js
```

The server will start on `http://localhost:4444`

### API Endpoints

#### 1. Document Ingestion
```bash
curl -X POST http://localhost:4444/api/ingest \
  -H "Content-Type: application/json"
```

Processes and indexes the Amazon report document into vector embeddings.

#### 2. Query Documents
```bash
curl -X POST http://localhost:4444/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is Amazon?"}'
```

Performs RAG-based question answering using the indexed documents.

## 🔍 Observability

### OpenTelemetry Integration

The application includes comprehensive tracing with:

- **Custom Spans**: Document processing, embedding generation, database operations
- **AI SDK Tracing**: Automatic instrumentation of OpenAI, Anthropic, and Vertex AI calls
- **Performance Metrics**: Token usage, costs, response times, and quality scores
- **Error Tracking**: Detailed error events and span status reporting

### Trace Structure

```
rag_query_workflow_zohaib
├── embedding_user_query
├── retrieval_process
│   ├── database_search
│   └── re-ranking_chunks
└── llm_generation_gpt4o
```

### TestOps Dashboard

Access your traces at `http://localhost:3000` (if TestOps is configured)

## 🧪 Testing

### Sample Queries
```bash
# Financial data
curl -X POST http://localhost:4444/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What was Amazon'\''s revenue in 2023?"}'

# AWS performance
curl -X POST http://localhost:4444/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How did AWS perform in 2023?"}'
```

## 📚 Dependencies

### Core Dependencies
- **express**: Web framework
- **@langchain/openai**: LangChain OpenAI integration
- **langchain**: LangChain framework
- **pg**: PostgreSQL client

### OpenTelemetry Stack
- **@opentelemetry/sdk-node**: Node.js SDK
- **@opentelemetry/auto-instrumentations-node**: Automatic instrumentation
- **@opentelemetry/exporter-trace-otlp-http**: OTLP HTTP trace exporter

### AI SDK Instrumentation
- **@traceloop/instrumentation-openai**: OpenAI tracing
- **@traceloop/instrumentation-anthropic**: Anthropic tracing
- **@traceloop/instrumentation-vertexai**: Vertex AI tracing

## 🔧 Development

### Project Structure
```
rag-assignment/
├── server.js              # Main application server
├── instrument.js           # OpenTelemetry configuration
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (not committed)
├── .gitignore            # Git ignore rules
├── Amazon-com-I-Report.txt # Sample document
└── public/               # Static files
    └── index.html        # Frontend interface
```

### Key Features

1. **Document Processing**: Recursive text splitting with overlap
2. **Vector Embeddings**: OpenAI Ada-002 embeddings
3. **Similarity Search**: PostgreSQL pgvector cosine similarity
4. **LLM Integration**: GPT-4o for answer generation
5. **Cost Tracking**: Token usage and cost estimation
6. **Quality Scoring**: Context grounding assessment

## 🚀 Deployment

1. **Database Setup**: Ensure PostgreSQL with pgvector extension
2. **Environment Configuration**: Set all required environment variables
3. **Process Management**: Use PM2 or similar for production
4. **Monitoring**: Configure TestOps or other observability platforms

## 📄 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add appropriate tests
5. Submit a pull request

## 📞 Support

For issues and questions, please open a GitHub issue or contact the maintainers.