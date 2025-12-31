---
id: tpl_book_publishing
title: Book Publishing
description: Book writing and publishing workflow with research, editing, and formatting tools
tags:
  - writing
  - publishing
  - book
  - creative
  - research
  - editing
  - markdown
applicable_to: null
metadata:
  default_model: anthropic/claude-sonnet-4-20250514
  recommended_agents:
    - editor
    - researcher
  interview_questions:
    - What type of book? (fiction, non-fiction, technical, memoir)
    - What's the target length? (short, standard, long)
    - Do you have an outline already?
    - What publishing format? (ebook, print, both)
    - Need research assistance?
---

# Book Publishing Template

A comprehensive template for writing, editing, and publishing books. Supports fiction, non-fiction, technical writing, and more.

## Recommended Folder Structure

```
book-project/
├── .opencode/
│   ├── agent/
│   │   ├── editor.md             # Editorial review agent
│   │   ├── researcher.md         # Research assistant
│   │   └── fact-checker.md       # Fact verification (non-fiction)
│   └── command/
│       ├── review.md             # Review chapter
│       ├── outline.md            # Generate/update outline
│       ├── research.md           # Research topic
│       └── export.md             # Export to format
├── manuscript/
│   ├── front-matter/
│   │   ├── title-page.md
│   │   ├── dedication.md
│   │   ├── preface.md
│   │   └── table-of-contents.md
│   ├── chapters/
│   │   ├── chapter-01.md
│   │   ├── chapter-02.md
│   │   └── ...
│   ├── back-matter/
│   │   ├── appendix-a.md
│   │   ├── bibliography.md
│   │   ├── glossary.md
│   │   └── index.md
│   └── notes/
│       └── author-notes.md
├── research/
│   ├── sources.md                # Source bibliography
│   ├── interviews/
│   ├── references/
│   └── fact-checks/
├── planning/
│   ├── outline.md                # Book outline
│   ├── character-sheets/         # For fiction
│   ├── timeline.md
│   └── themes.md
├── exports/
│   ├── epub/
│   ├── pdf/
│   └── docx/
├── opencode.json
├── AGENTS.md
├── book-config.yaml              # Book metadata
└── README.md
```

## Generated Configuration Files

### opencode.json

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": {
    "agentpod_knowledge": {
      "type": "remote",
      "url": "{env:MANAGEMENT_API_URL}/api/mcp/knowledge",
      "headers": {
        "Authorization": "Bearer {env:AGENTPOD_API_TOKEN}"
      }
    }
  },
  "agent": {
    "editor": {
      "description": "Reviews and improves prose, structure, and style",
      "mode": "subagent"
    },
    "researcher": {
      "description": "Researches topics and finds sources",
      "mode": "subagent"
    }
  },
  "command": {
    "review": {
      "description": "Review a chapter for style and clarity",
      "template": "Review the specified chapter for prose quality, pacing, and clarity. Suggest improvements."
    },
    "outline": {
      "description": "Generate or update book outline",
      "template": "Analyze the current manuscript and update the outline in planning/outline.md"
    },
    "research": {
      "description": "Research a topic",
      "template": "Research $ARGUMENTS and add findings to research/sources.md with proper citations."
    },
    "export": {
      "description": "Export manuscript to format",
      "template": "Export the manuscript to the specified format using pandoc or similar tool."
    }
  },
  "tools": {
    "bash": true,
    "webfetch": true
  }
}
```

### AGENTS.md

```markdown
# Book Project: [BOOK TITLE]

A [GENRE] book about [BRIEF DESCRIPTION].

## Project Structure

- `manuscript/` - The actual book content
  - `front-matter/` - Title page, dedication, preface
  - `chapters/` - Main content chapters
  - `back-matter/` - Appendix, bibliography, index
- `research/` - Research materials and sources
- `planning/` - Outline, character sheets, timeline
- `exports/` - Generated output files

## Writing Guidelines

- Write in [MARKDOWN] format
- One chapter per file
- Use consistent heading levels
- Include chapter summaries at the start
- Track word count in frontmatter

## Chapter Format

Each chapter file should follow:

```markdown
---
title: Chapter Title
chapter: 1
status: draft | review | final
word_count: 0
last_updated: YYYY-MM-DD
---

# Chapter Title

[Chapter content...]
```

## Available Commands

- `/review @chapter-01` - Get editorial feedback on a chapter
- `/outline` - Update the book outline
- `/research [topic]` - Research a topic
- `/export epub` - Export to EPUB format

## Available Agents

- `@editor` - Editorial review and prose improvement
- `@researcher` - Research assistance and fact-finding

## Workflow

1. **Planning Phase**
   - Create outline in `planning/outline.md`
   - Define characters/key concepts
   - Set timeline and milestones

2. **Drafting Phase**
   - Write chapter drafts
   - Track progress in frontmatter
   - Use `@researcher` for fact-checking

3. **Revision Phase**
   - Use `@editor` for feedback
   - Revise based on suggestions
   - Update status to 'review'

4. **Final Phase**
   - Final proofread
   - Update status to 'final'
   - Export using `/export`
```

### .opencode/agent/editor.md

```markdown
---
description: Reviews and improves prose, structure, and style
mode: subagent
model: anthropic/claude-sonnet-4-20250514
tools:
  write: true
  edit: true
  bash: false
  webfetch: false
---

# Editorial Agent

You are an experienced book editor providing developmental and line editing feedback.

## Editing Approach

### Developmental Editing
- Story/argument structure
- Pacing and flow
- Character development (fiction)
- Logical progression (non-fiction)
- Reader engagement

### Line Editing
- Sentence structure
- Word choice
- Clarity and concision
- Voice consistency
- Rhythm and flow

### Copy Editing
- Grammar and punctuation
- Consistency in style
- Fact verification flags
- Formatting issues

## Feedback Format

When reviewing a chapter, provide:

### 1. Overall Assessment
- Strengths of the chapter
- Main areas for improvement
- Pacing analysis

### 2. Structural Notes
- Opening hook effectiveness
- Section transitions
- Ending impact

### 3. Line-Level Suggestions
For significant issues:
```
Line/paragraph reference:
Original: "[text]"
Suggested: "[improved text]"
Reason: [explanation]
```

### 4. Style Notes
- Voice consistency
- Tone appropriateness
- Reader engagement

## Guidelines

- Preserve the author's voice
- Explain the "why" behind suggestions
- Prioritize substantive over stylistic issues
- Be encouraging while being honest
- Focus on teaching, not just fixing
```

### .opencode/agent/researcher.md

```markdown
---
description: Researches topics and finds credible sources
mode: subagent
model: anthropic/claude-sonnet-4-20250514
tools:
  write: true
  edit: true
  bash: false
  webfetch: true
---

# Research Assistant

You are a research assistant helping gather and organize information for a book project.

## Research Process

1. **Understand the Need**
   - What information is needed?
   - What's the context in the book?
   - What level of detail?

2. **Find Sources**
   - Search for credible sources
   - Prioritize primary sources
   - Include diverse perspectives

3. **Evaluate Sources**
   - Check credibility
   - Verify recency
   - Note any bias

4. **Synthesize Information**
   - Summarize key points
   - Identify contradictions
   - Note gaps in research

5. **Document**
   - Proper citations
   - Save to research folder
   - Link to relevant chapters

## Source Documentation Format

```markdown
## [Topic]

### Summary
[Brief summary of findings]

### Key Points
1. [Point 1]
2. [Point 2]
3. [Point 3]

### Sources

#### Primary Sources
- [Source 1]: [Citation]
  - Key quote: "[relevant quote]"
  - Relevance: [how it applies to the book]

#### Secondary Sources
- [Source 2]: [Citation]
  - Summary: [brief summary]

### Questions for Further Research
- [Question 1]
- [Question 2]

### Notes for Chapter [X]
[Specific notes on how to use this research]
```

## Guidelines

- Always cite sources properly
- Flag uncertain or controversial claims
- Note when expert consultation may be needed
- Organize by topic and relevance
- Keep source material for verification
```

### .opencode/command/review.md

```markdown
---
description: Review a chapter for style and clarity
agent: editor
subtask: true
---

Please review the chapter at @$ARGUMENTS for:

1. **Prose Quality**
   - Sentence variety
   - Word choice
   - Clarity

2. **Structure**
   - Opening effectiveness
   - Pacing
   - Transitions
   - Ending

3. **Engagement**
   - Reader interest
   - Emotional resonance
   - Information delivery

Provide specific suggestions with examples. Be constructive and preserve the author's voice.
```

### .opencode/command/research.md

```markdown
---
description: Research a topic and document findings
agent: researcher
subtask: true
---

Research the following topic: $ARGUMENTS

1. Search for relevant, credible information
2. Gather key facts, statistics, and quotes
3. Document sources with proper citations
4. Save findings to `research/sources.md`
5. Note how this connects to the book content

Be thorough but focused. Prioritize authoritative sources.
```

### book-config.yaml

```yaml
# Book Configuration
title: "Your Book Title"
subtitle: "Optional Subtitle"
author: "Author Name"
genre: "Genre"
target_audience: "Who this book is for"

# Publishing details
isbn: ""
publisher: ""
publication_date: ""

# Manuscript settings
target_word_count: 80000
chapters: 20

# Export settings
formats:
  - epub
  - pdf
  - docx

# Style settings
font_family: "Georgia"
font_size: 12
line_spacing: 1.5
```

## Genre-Specific Variations

### Fiction

**Additional folders:**
```
├── planning/
│   ├── character-sheets/
│   │   ├── protagonist.md
│   │   └── antagonist.md
│   ├── world-building/
│   │   ├── setting.md
│   │   └── magic-system.md      # If fantasy
│   └── plot-structure.md
```

**Additional agent - Story Consultant:**
```markdown
---
description: Helps with plot, character, and story structure
mode: subagent
---
Focus on narrative techniques, character arcs, plot holes, and story pacing.
```

### Non-Fiction / Technical

**Additional folders:**
```
├── manuscript/
│   ├── chapters/
│   └── case-studies/
├── research/
│   ├── data/
│   ├── interviews/
│   └── expert-quotes/
```

**Additional agent - Fact Checker:**
```markdown
---
description: Verifies facts and flags claims needing citation
mode: subagent
---
Focus on accuracy, proper attribution, and identifying claims that need sources.
```

### Memoir

**Additional folders:**
```
├── planning/
│   ├── timeline.md
│   ├── key-people.md
│   └── themes.md
├── reference/
│   ├── photos/
│   └── documents/
```

## Interview Questions for Customization

1. **Genre**
   - "What type of book are you writing?"
   - Fiction, Non-fiction, Technical, Memoir, Self-help

2. **Length**
   - "What's your target word count?"
   - Short (40-60k), Standard (60-80k), Long (80-120k)

3. **Current Status**
   - "Do you have an outline already?"
   - Starting fresh, Have outline, Partial draft

4. **Publishing Path**
   - "How do you plan to publish?"
   - Traditional, Self-publish, Undecided

5. **Format**
   - "What formats do you need?"
   - Ebook, Print, Both, Audiobook

6. **Research Needs**
   - "Will you need research assistance?"
   - Heavy research, Light research, No research

## Customization Logic

Based on answers:

1. Set up genre-appropriate folder structure
2. Configure relevant agents (editor, researcher, fact-checker)
3. Create appropriate planning templates
4. Set target word count and chapter structure
5. Include export configurations for chosen formats
6. Add genre-specific writing guidelines to AGENTS.md
