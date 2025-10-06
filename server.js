// server.js
// // Import OpenTelemetry instrumentation FIRST
require('./instrument');

// Import necessary libraries
const express = require('express');
const { Pool } = require('pg');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const fs = require('fs');
const path = require('path');
// Use dotenv to load environment variables from the .env file
require('dotenv').config();

// Import OpenTelemetry tracer
const { tracer, opentelemetry } = require('./instrument');

// Import AI Provider Factory
const { AIProviderFactory } = require('./config/aiProviders');

const app = express();
const port = process.env.PORT || 4444;

app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
});

// Configuration: Choose your AI provider here
const AI_PROVIDER = process.env.AI_PROVIDER || 'anthropic'; // 'openai' or 'anthropic'

// Check if provider is configured
if (!AIProviderFactory.isProviderConfigured(AI_PROVIDER)) {
  console.error(`❌ Provider '${AI_PROVIDER}' is not properly configured. Check your environment variables.`);
  if (AI_PROVIDER === 'anthropic') {
    console.error('Required: ANTHROPIC_API_KEY and OPENAI_API_KEY (for embeddings)');
  } else if (AI_PROVIDER === 'openai') {
    console.error('Required: OPENAI_API_KEY');
  }
  process.exit(1);
}

// Initialize AI models using the factory
const embeddings = AIProviderFactory.createEmbeddingModel(AI_PROVIDER);
const model = AIProviderFactory.createChatModel(AI_PROVIDER);
const providerInfo = AIProviderFactory.getProviderInfo(AI_PROVIDER);

console.log(`🤖 Using AI Provider: ${providerInfo.name}`);
console.log(`💬 Chat Model: ${providerInfo.chatModel}`);
console.log(`🔍 Embedding Model: ${providerInfo.embeddingModel}`);


// --- Ingestion Endpoint - Using OpenTelemetry ---
app.post('/api/ingest', async (req, res) => {
  const span = tracer.startSpan('data_pipeline_ingestion_zohaib', {
    attributes: {
      'service.name': 'rag-backend',
      'service.version': '1.0.0',
      'deployment.environment': 'development',
      'telemetry.sdk.language': 'javascript',
      'operation.type': 'data_pipeline_ingestion',
      'telemetry.source': 'rag-application'
    }
  });

  try {
    const documentPath = path.join(__dirname, 'Amazon-com-I-Report.txt');
    const documentText = fs.readFileSync(documentPath, 'utf-8');

    // Document chunking span
    const chunkingSpan = tracer.startSpan('chunking_document', {
      parent: span,
      attributes: {
        'operation': 'chunking',
        'file.path': documentPath
      }
    });

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitText(documentText);
    
    chunkingSpan.setAttributes({
      'chunks.count': chunks.length
    });
    chunkingSpan.end();

    // Add event for checkpoint
    span.addEvent('document_split_checkpoint', {
      'event.type': 'checkpoint',
      'message': `Document split into ${chunks.length} chunks.`
    });

    // Embedding generation span
    const embeddingSpan = tracer.startSpan('generating_embeddings', {
      parent: span,
      attributes: {
        'operation': 'embedding',
        'model.name': providerInfo.embeddingModel,
        'model.provider': providerInfo.name
      }
    });

    const allEmbeddings = await embeddings.embedDocuments(chunks);
    
    embeddingSpan.setAttributes({
      'embeddings.count': allEmbeddings.length
    });
    embeddingSpan.end();

    // Database insertion
    const dbSpan = tracer.startSpan('database_insert', {
      parent: span,
      attributes: {
        'operation': 'database',
        'db.table': 'chunks'
      }
    });

    const values = allEmbeddings.map((embedding, index) => {
      const escapedContent = chunks[index].replace(/'/g, "''");
      return `('${escapedContent}', '${JSON.stringify(embedding)}'::vector)`;
    });
    await pool.query('DELETE FROM chunks;');
    const insertQuery = `INSERT INTO chunks (content, embedding) VALUES ${values.join(',')};`;
    await pool.query(insertQuery);
    
    dbSpan.setAttributes({
      'db.rows.inserted': allEmbeddings.length
    });
    dbSpan.end();

    span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
    res.status(200).send({ message: 'Document ingested successfully.' });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    
    span.addEvent('ingestion_error_event', {
      'error.type': 'IngestionError',
      'error.message': error.message
    });
    span.setStatus({ 
      code: opentelemetry.SpanStatusCode.ERROR, 
      message: error.message 
    });

    res.status(500).send({ message: 'Ingestion failed.', error: error.message });
  } finally {
    span.end();
  }
});

// --- RAG Query Endpoint - Using OpenTelemetry ---
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).send({ message: 'Query is required.' });
  }

  let retrievedChunks = [];
  let topChunks = [];
  let finalAnswer = 'Failed to generate answer.';

  const span = tracer.startSpan('rag_query_workflow_zohaib', {
    attributes: {
      'service.name': 'rag-backend',
      'service.version': '1.0.0',
      'deployment.environment': 'development',
      'telemetry.sdk.language': 'javascript',
      'operation.type': 'rag_query_workflow',
      'telemetry.source': 'rag-application',
      'user.query': query
    }
  });

  try {
    // Query embedding span
    const queryEmbeddingSpan = tracer.startSpan('embedding_user_query', {
      parent: span,
      attributes: {
        'operation': 'embedding'
      }
    });
    const queryEmbedding = await embeddings.embedQuery(query);
    queryEmbeddingSpan.setAttributes({
      'query.embedding.length': queryEmbedding.length
    });
    queryEmbeddingSpan.end();

    // Retrieval process span
    const retrievalSpan = tracer.startSpan('retrieval_process', {
      parent: span,
      attributes: {
        'operation': 'retrieval',
        'initial.query': query
      }
    });

    // Database search span
    const dbSearchSpan = tracer.startSpan('database_search', {
      parent: retrievalSpan,
      attributes: {
        'db.table': 'chunks',
        'span.level': 'child'
      }
    });
    
    const { rows } = await pool.query(
      `SELECT content, 1 - (embedding <=> $1::vector) as similarity_score
      FROM chunks
      ORDER BY embedding <=> $1::vector
      LIMIT 5`,
      [JSON.stringify(queryEmbedding)]
    );
    
    dbSearchSpan.setAttributes({
      'retrieved.chunks.count': rows.length
    });
    dbSearchSpan.end();

    // Re-ranking span
    const rerankingSpan = tracer.startSpan('re-ranking_chunks', {
      parent: retrievalSpan,
      attributes: {
        'operation': 're_ranking',
        'span.level': 'child',
        'initial.candidates': rows.length
      }
    });
    
    retrievedChunks = rows.map(row => ({
      text: row.content,
      score: row.similarity_score,
    }));
    topChunks = retrievedChunks.slice(0, 3);
    
    rerankingSpan.setAttributes({
      'final.chunks.selected': topChunks.length
    });
    rerankingSpan.end();
    retrievalSpan.end();

    // LLM Generation span
    const context = topChunks.map(chunk => chunk.text).join('\n\n---\n\n');
    const prompt = `You are a helpful assistant. Use the following pieces of context to answer the question.
If you don't know the answer, just say that you don't know. Do not make up an answer.
----------------
Context:\n${context}\n----------------\nQuestion: ${query}\n`;
// Manual LLM Tracing - Optional
    // const llmSpan = tracer.startSpan('llm_generation', {
    //   parent: span,
    //   attributes: {
    //     'operation': 'llm_call',
    //     'model.provider': providerInfo.name,
    //     'model.name': providerInfo.chatModel,
    //     'model.temperature': 0.2,
    //     'llm.request.type': 'generation'
    //   }
    // });

    const llmResponse = await model.invoke(prompt);
    
    finalAnswer = llmResponse.content.trim();

    // llmSpan.setAttributes({
    //   'ai.usage.prompt_tokens': promptTokens,
    //   'ai.usage.completion_tokens': completionTokens,
    //   'llm.response.length': finalAnswer.length
    // });
    // llmSpan.end();

    // Add quality score as an event
    span.addEvent('answer_quality_score', {
      'score.name': 'answer_quality_score',
      'score.value': 1.0,
      'score.comment': 'Answer is grounded in the retrieved context.'
    });

    span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
    
    res.status(200).send({
      answer: finalAnswer,
      chunks: retrievedChunks,
      highlightedChunks: topChunks,
    });
    
  } catch (error) {
    console.error('RAG query error:', error);
    
    span.addEvent('query_error_event', {
      'error.type': 'QueryError',
      'error.message': error.message
    });
    span.setStatus({ 
      code: opentelemetry.SpanStatusCode.ERROR, 
      message: error.message 
    });
    
    res.status(500).send({ 
        message: 'Failed to process query.', 
        error: error.message,
        answer: finalAnswer,
    });
  } finally {
    span.end();
  }
});

// --- Start the server ---
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
