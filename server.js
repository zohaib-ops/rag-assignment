// server.js
// Import necessary libraries
const express = require('express');
const { Pool } = require('pg');
const { OpenAIEmbeddings, ChatOpenAI } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const fs = require('fs');
const path = require('path');
// Use dotenv to load environment variables from the .env file
require('dotenv').config();

// Import the TestOps SDK
const { TestOpsClient } = require('testops');

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

const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002",
});

const model = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o",
    temperature: 0.2,
});

const testOps = new TestOpsClient({
  publicKey: process.env.TESTOPS_PUBLIC_KEY,
  secretKey: process.env.TESTOPS_SECRET_KEY,
});

/**
 * Utility function to calculate simulated cost based on token usage.
 */
const calculateCost = (promptTokens, completionTokens, modelName) => {
    const costPerPromptToken = 0.000005; 
    const costPerCompletionToken = 0.000015;
    return (promptTokens * costPerPromptToken) + (completionTokens * costPerCompletionToken);
};

// --- Ingestion Endpoint - Modeled after testBasicSpanCreation & testEventTracing ---
app.post('/api/ingest', async (req, res) => {
  let trace = null;
  
  try {
    trace = testOps.trace({
      name: 'data_pipeline_ingestion_zohaib', // Unique identifier for filtering
      metadata: {
        test_type: 'data_pipeline_ingestion',
        otel_integration: true,
        telemetry_source: 'rag-application',
        otel_attributes: {
          'service.name': 'rag-backend',
          'service.version': '1.0.0',
          'deployment.environment': 'development',
          'telemetry.sdk.language': 'javascript',
          'telemetry.sdk.name': 'testops',
        },
      },
      tags: ['rag_zohaib', 'data_pipeline', 'ingestion'],
    });

    const documentPath = path.join(__dirname, 'Amazon-com-I-Report.txt');
    const documentText = fs.readFileSync(documentPath, 'utf-8');

    if (trace) {
      const chunkingSpan = trace.span({
        name: 'chunking_document',
        input: { file_path: documentPath },
        metadata: { operation: 'chunking' },
      });
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const chunks = await splitter.splitText(documentText);
      chunkingSpan.end({ output: { chunks_count: chunks.length } });

      trace.event({
        name: 'document_split_checkpoint',
        metadata: { 
          event_type: 'checkpoint', 
          message: `Document split into ${chunks.length} chunks.`
        },
      });

      const embeddingSpan = trace.span({
        name: 'generating_embeddings',
        input: { model_name: embeddings.modelName },
        metadata: { operation: 'embedding' },
      });
      const allEmbeddings = await embeddings.embedDocuments(chunks);
      embeddingSpan.end({ output: { embeddings_count: allEmbeddings.length } });

      
      const values = allEmbeddings.map((embedding, index) => {
        const escapedContent = chunks[index].replace(/'/g, "''");
        return `('${escapedContent}', '${JSON.stringify(embedding)}'::vector)`;
      });
      await pool.query('DELETE FROM chunks;');
      const insertQuery = `INSERT INTO chunks (content, embedding) VALUES ${values.join(',')};`;
      await pool.query(insertQuery);
      const dbSpan = trace.span({
        name: 'database_insert',
        input: { query: insertQuery},
        metadata: { operation: 'database', db_table: 'chunks' },
      });
      dbSpan.end({ output: { inserted_rows: allEmbeddings.length } });
      
      // REMOVED: trace.end({ status: 'success' }); -> Rely on flushAsync() to finalize
    }
    
    await testOps.flushAsync(); // Implicitly closes and sends the trace
    
    res.status(200).send({ message: 'Document ingested successfully.' });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    
    if (trace) {
      // Still log the error event to the trace before flushing
      trace.event({
          name: 'ingestion_error_event',
          metadata: { error_type: 'IngestionError', message: error.message },
      });
      // REMOVED: trace.end({ status: 'failure' });
    }

    await testOps.flushAsync(); // Implicitly closes and sends the trace

    res.status(500).send({ message: 'Ingestion failed.', error: error.message });
  } finally {
    await testOps.shutdownAsync();
  }
});

// --- RAG Query Endpoint - Modeled after testGenerationTracing, testTraceHierarchy, testOTelScoring ---
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).send({ message: 'Query is required.' });
  }

  let trace = null;
  let retrievedChunks = [];
  let topChunks = [];
  let finalAnswer = 'Failed to generate answer.';

  try {
    trace = testOps.trace({
      name: 'rag_query_workflow_zohaib',
      input: { user_query: query },
      metadata: {
        test_type: 'rag_query_workflow',
        otel_integration: true,
        telemetry_source: 'rag-application',
        otel_attributes: {
          'service.name': 'rag-backend',
          'service.version': '1.0.0',
          'deployment.environment': 'development',
          'telemetry.sdk.language': 'javascript',
          'telemetry.sdk.name': 'testops',
        },
      },
      tags: ['rag_zohaib', 'query_zohaib', 'llm'],
    });

    if (trace) {
      const queryEmbeddingSpan = trace.span({
        name: 'embedding_user_query',
        metadata: { operation: 'embedding' },
      });
      const queryEmbedding = await embeddings.embedQuery(query);
      queryEmbeddingSpan.end({ output: { query_embedding_length: queryEmbedding.length } });

      const retrievalSpan = trace.span({
        name: 'retrieval_process',
        input: { initial_query: query },
        metadata: { operation: 'retrieval' },
      });
      
      const dbSearchSpan = retrievalSpan.span({
          name: 'database_search',
          metadata: { db_table: 'chunks', span_level: 'child' },
      });
      const { rows } = await pool.query(
        `SELECT content, 1 - (embedding <=> $1::vector) as similarity_score
        FROM chunks
        ORDER BY embedding <=> $1::vector
        LIMIT 5`,
        [JSON.stringify(queryEmbedding)]
      );
      dbSearchSpan.end({ output: { retrieved_chunks_count: rows.length } });

      const rerankingSpan = retrievalSpan.span({
        name: 're-ranking_chunks',
        input: { initial_candidates: rows.length },
        metadata: { operation: 're_ranking', span_level: 'child' },
      });
      retrievedChunks = rows.map(row => ({
        text: row.content,
        score: row.similarity_score,
      }));
      topChunks = retrievedChunks.slice(0, 3);
      rerankingSpan.end({ output: { final_chunks_selected: topChunks.length } });

      retrievalSpan.end();
      
      const context = topChunks.map(chunk => chunk.text).join('\n\n---\n\n');
      const prompt = `You are a helpful assistant. Use the following pieces of context to answer the question.
If you don't know the answer, just say that you don't know. Do not make up an answer.
----------------
Context:\n${context}\n----------------\nQuestion: ${query}\n`;

      const llmGeneration = trace.generation({
        name: 'llm_generation_gpt4o',
        model: model.modelName,
        input: { prompt, user_query: query },
        metadata: {
          operation: 'llm_call',
          model_provider: 'openai',
          temperature: model.temperature,
        },
      });
      const llmResponse = await model.invoke(prompt);
      
      const promptTokens = 50 + topChunks.reduce((sum, chunk) => sum + chunk.text.length / 4, 0);
      const completionTokens = llmResponse.content.length / 4;
      const cost = calculateCost(promptTokens, completionTokens, model.modelName);
      finalAnswer = llmResponse.content.trim();

      llmGeneration.end({ 
        output: { response: finalAnswer },
        metadata: {
          'ai.usage.prompt_tokens': promptTokens,
          'ai.usage.completion_tokens': completionTokens,
          'cost_estimate': cost,
        },
      });
      
      testOps.score({
          traceId: trace.id,
          observationId: llmGeneration.id,
          name: 'answer_quality_score',
          value: 1.0, 
          comment: 'Answer is grounded in the retrieved context.',
      });

      // REMOVED: trace.end({ status: 'success' }); -> Rely on flushAsync() to finalize
    }
    
    await testOps.flushAsync();
    
    res.status(200).send({
      answer: finalAnswer,
      chunks: retrievedChunks,
      highlightedChunks: topChunks,
    });
    
  } catch (error) {
    console.error('RAG query error:', error);
    
    if (trace) {
      trace.event({
          name: 'query_error_event',
          metadata: { error_type: 'QueryError', message: error.message },
      });
      // REMOVED: trace.end({ status: 'failure' });
    }

    await testOps.flushAsync();
    
    res.status(500).send({ 
        message: 'Failed to process query.', 
        error: error.message,
        answer: finalAnswer,
    });
  } finally {
    await testOps.shutdownAsync();
  }
});

// --- Start the server ---
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
