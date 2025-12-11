# Databases Add-on

Adds local database servers and tools for development.

## Included Databases

| Database | Description | Port |
|----------|-------------|------|
| **PostgreSQL 16** | Relational database with pgvector for AI/ML | 5432 |
| **Redis** | In-memory data store | 6379 |
| **SQLite** | Embedded database | - |
| **DuckDB** | Fast analytical database | - |

## Features

### PostgreSQL with pgvector
- Vector similarity search for AI/ML applications
- Store and query embeddings directly in PostgreSQL
- Perfect for RAG (Retrieval Augmented Generation) applications

```sql
-- Enable pgvector extension
CREATE EXTENSION vector;

-- Create a table with vector column
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  embedding vector(1536)  -- OpenAI embedding dimension
);

-- Find similar items
SELECT * FROM items 
ORDER BY embedding <-> '[0.1, 0.2, ...]'::vector 
LIMIT 5;
```

### DuckDB
- Fast analytical queries on local files
- Read CSV, Parquet, JSON directly
- Great for data science workflows

```bash
# Start DuckDB CLI
duckdb

# Query a CSV file directly
SELECT * FROM 'data.csv' LIMIT 10;

# Query Parquet files
SELECT * FROM 'data/*.parquet';
```

### Redis
- In-memory caching
- Session storage
- Pub/sub messaging

```bash
# Connect to Redis
redis-cli

# Basic operations
SET mykey "Hello"
GET mykey
```

## Python Libraries Included

- `psycopg2-binary` - PostgreSQL adapter
- `redis` - Redis client
- `duckdb` - DuckDB Python API
- `sqlalchemy` - SQL toolkit and ORM
- `pgvector` - pgvector support for SQLAlchemy

## Data Directories

| Database | Data Directory |
|----------|----------------|
| PostgreSQL | `/home/developer/data/postgres` |
| Redis | `/home/developer/data/redis` |
| DuckDB | `/home/developer/data/duckdb` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `REDIS_PORT` | 6379 | Redis port |
| `PGDATA` | `/home/developer/data/postgres` | PostgreSQL data directory |

## Notes

- Databases are configured for **local development only** (no authentication)
- Data persists within the container but is lost when container is removed
- For production, use external managed databases
