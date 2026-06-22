# Database Schema (SQLite + Drizzle)

All tables live in `userData/app.db`. IDs are text UUIDs. Timestamps are unix
epoch millis (integer). JSON columns store stringified JSON. Embeddings are
stored as `BLOB` (Float32Array bytes) for compactness; the retriever decodes
them for cosine search.

## ER overview

```
profiles 1───* documents 1───* chunks ──* embeddings
   │                                   (1:1 chunk:embedding)
   ├──* notes
   └──* sessions 1──* transcript_chunks
                 1──* detected_questions 1──* ai_answers
                 1──1 session_reports

settings (singleton-ish key/value, incl. encrypted API key)
```

## Tables

### `profiles`
| col | type | notes |
|---|---|---|
| id | text PK | uuid |
| name | text | |
| target_role | text | |
| target_company | text | nullable |
| interview_type | text | enum: behavioral/technical/coding/system_design/product/sales/general |
| answer_style | text | enum: concise/detailed/star/technical/conversational |
| language | text | default 'en' |
| resume_text | text | extracted raw text (nullable) |
| jd_text | text | extracted raw text (nullable) |
| parsed_resume | text(json) | structured candidate JSON |
| parsed_jd | text(json) | structured JD JSON |
| created_at / updated_at | int | |

### `documents`
Uploaded file metadata + parsed text.
| id | profile_id FK | kind (resume/jd/note/other) | filename | mime | source_path | text | created_at |

### `notes`
Freeform additional notes attached to a profile.
| id | profile_id FK | content | created_at |

### `chunks`
Chunked text from documents/notes/profile fields for RAG.
| id | profile_id FK | source_type (resume/jd/note) | source_id | ord | content | token_count | created_at |

### `embeddings`
| id | chunk_id FK (unique) | model | dim | vector BLOB | created_at |

### `sessions`
| id | profile_id FK | interview_type | status (idle/live/stopped) | started_at | ended_at | created_at |

### `transcript_chunks`
| id | session_id FK | speaker (interviewer/candidate/unknown) | text | is_final (int bool) | t_start | t_end | created_at |

### `detected_questions`
| id | session_id FK | text | type | confidence (real) | strategy | transcript_chunk_id FK | created_at |

### `ai_answers`
| id | question_id FK | direct_answer | talking_points (json[]) | resume_match (json) | star (json, nullable) | clarifying_question | risk_warning | followup_question | model | tokens (json) | created_at |

### `session_reports`
| id | session_id FK (unique) | summary | strengths (json) | improvements (json) | per_question (json) | created_at |

### `settings`
Key/value singleton store.
| key TEXT PK | value TEXT |

Known keys:
- `openai_api_key_enc` — safeStorage ciphertext (base64). **Never** returned raw.
- `openai_api_key_present` — `'1'`/`'0'` flag the renderer may read.
- `models` — json overrides for model ids.
- `overlay_prefs` — json `{opacity, fontSize, mode}`.
- `privacy_mode` — `'1'`/`'0'`.
- `data_consent_ack` — `'1'` once user acknowledges the compliance reminder.

## Deletion semantics
Deleting a profile cascades to its documents, notes, chunks, embeddings,
sessions, and everything under sessions (FK `on delete cascade`). Original
uploaded files in `userData/documents/` are removed by the documents service.

## Indexes
- `chunks(profile_id)`, `embeddings(chunk_id)`, `transcript_chunks(session_id)`,
  `detected_questions(session_id)`, `ai_answers(question_id)`,
  `sessions(profile_id)`.
