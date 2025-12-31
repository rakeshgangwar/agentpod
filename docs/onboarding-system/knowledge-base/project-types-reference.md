# Project Types Reference

A comprehensive catalog of 254 project types for the AgentPod onboarding system knowledge base. This document serves as a reference for building out project templates.

## Overview

| Category | Count | Description |
|----------|-------|-------------|
| Software Development - Web | 25 | Web apps, frontends, CMSs |
| Software Development - Backend | 20 | APIs, servers, microservices |
| Software Development - Mobile | 12 | iOS, Android, cross-platform |
| Software Development - Desktop | 8 | Electron, Tauri, native |
| Software Development - Extensions & Plugins | 12 | Browser, IDE, platform plugins |
| Software Development - Bots & Automation | 10 | Chat bots, automation scripts |
| Software Development - Libraries & SDKs | 10 | Packages, frameworks, SDKs |
| Data & AI | 25 | ML, data pipelines, AI agents |
| Content & Creative | 20 | Books, blogs, courses, media |
| Business & Productivity | 18 | Planning, research, documentation |
| DevOps & Infrastructure | 15 | CI/CD, cloud, monitoring |
| Specialized & Niche | 25 | Games, IoT, blockchain, security |
| **Personal & Lifestyle** | **10** | **Finance, habits, journals, fitness** |
| **Education & Learning** | **10** | **Study, flashcards, courses, tutorials** |
| **Art & Design** | **8** | **Design systems, illustrations, UI** |
| **Events & Communities** | **6** | **Events, hackathons, meetups** |
| **Health & Wellness** | **6** | **Meditation, nutrition, mental health** |
| **Environment & Sustainability** | **4** | **Carbon tracking, green energy** |
| **Legal & Compliance** | **4** | **Audits, policies, risk assessment** |
| **Creative Non-Code** | **6** | **Worldbuilding, TTRPG, music, DIY** |
| **Total** | **254** | |

---

## Software Development - Web (25)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 1 | `web_app_spa` | Single Page Application | Modern SPA with React, Vue, Svelte, or Angular. Client-side rendering with API backend. | `web`, `frontend`, `javascript`, `spa` | code-reviewer, accessibility-checker | High |
| 2 | `web_app_fullstack` | Full-Stack Web App | Complete web application with frontend, backend, and database. Monolithic or modular architecture. | `web`, `fullstack`, `database`, `frontend`, `backend` | code-reviewer, database-advisor, security-reviewer | High |
| 3 | `web_app_static` | Static Website | JAMstack site with static generation. Blogs, portfolios, landing pages. | `web`, `static`, `jamstack`, `ssg` | code-reviewer, seo-advisor | Medium |
| 4 | `web_app_ssr` | Server-Side Rendered App | SSR application with Next.js, Nuxt, or SvelteKit. SEO-optimized with hydration. | `web`, `ssr`, `nextjs`, `nuxt`, `sveltekit` | code-reviewer, performance-reviewer | High |
| 5 | `web_app_pwa` | Progressive Web App | Installable web app with offline support, push notifications, and app-like experience. | `web`, `pwa`, `offline`, `mobile` | code-reviewer, pwa-reviewer | Medium |
| 6 | `web_app_ecommerce` | E-commerce Website | Online store with product catalog, cart, checkout, and payment integration. | `web`, `ecommerce`, `payments`, `shop` | code-reviewer, security-reviewer, ux-reviewer | High |
| 7 | `web_app_saas` | SaaS Application | Multi-tenant SaaS platform with subscriptions, user management, and billing. | `web`, `saas`, `subscriptions`, `multi-tenant` | code-reviewer, security-reviewer, architect | High |
| 8 | `web_app_dashboard` | Admin Dashboard | Internal admin panel or dashboard with data tables, charts, and CRUD operations. | `web`, `dashboard`, `admin`, `internal` | code-reviewer, ux-reviewer | Medium |
| 9 | `web_app_cms` | Content Management System | Custom CMS for managing content, media, and users. | `web`, `cms`, `content`, `admin` | code-reviewer, security-reviewer | Medium |
| 10 | `web_app_social` | Social Platform | Social network features: profiles, feeds, messaging, notifications. | `web`, `social`, `realtime`, `messaging` | code-reviewer, security-reviewer, scalability-reviewer | Medium |
| 11 | `web_app_marketplace` | Marketplace Platform | Two-sided marketplace connecting buyers and sellers with listings and transactions. | `web`, `marketplace`, `ecommerce`, `platform` | code-reviewer, security-reviewer | Medium |
| 12 | `web_app_booking` | Booking/Reservation System | Appointment scheduling, calendar management, and booking workflows. | `web`, `booking`, `calendar`, `scheduling` | code-reviewer, ux-reviewer | Medium |
| 13 | `web_app_lms` | Learning Management System | Online learning platform with courses, quizzes, progress tracking, and certificates. | `web`, `lms`, `education`, `courses` | code-reviewer, ux-reviewer | Medium |
| 14 | `web_app_crm` | CRM System | Customer relationship management with contacts, deals, and pipelines. | `web`, `crm`, `sales`, `customers` | code-reviewer, ux-reviewer | Medium |
| 15 | `web_app_hrms` | HR Management System | Employee management, payroll, leave tracking, and HR workflows. | `web`, `hrms`, `hr`, `employees` | code-reviewer, security-reviewer | Low |
| 16 | `web_app_inventory` | Inventory Management | Stock tracking, warehousing, orders, and supply chain management. | `web`, `inventory`, `warehouse`, `stock` | code-reviewer, ux-reviewer | Low |
| 17 | `web_app_portal` | Customer Portal | Self-service portal for customers to manage accounts, tickets, and orders. | `web`, `portal`, `self-service`, `customers` | code-reviewer, ux-reviewer | Medium |
| 18 | `web_app_forum` | Forum/Community | Discussion forum with threads, categories, moderation, and user profiles. | `web`, `forum`, `community`, `discussion` | code-reviewer, moderation-advisor | Low |
| 19 | `web_app_wiki` | Wiki/Knowledge Base | Collaborative wiki with pages, versioning, and search. | `web`, `wiki`, `knowledge`, `documentation` | code-reviewer, ux-reviewer | Low |
| 20 | `web_app_portfolio` | Portfolio Website | Personal or agency portfolio showcasing work, projects, and skills. | `web`, `portfolio`, `personal`, `showcase` | code-reviewer, seo-advisor | Medium |
| 21 | `web_app_landing` | Landing Page | Marketing landing page with lead capture, A/B testing, and analytics. | `web`, `landing`, `marketing`, `conversion` | code-reviewer, seo-advisor | High |
| 22 | `web_app_directory` | Directory/Listing Site | Business directory, job board, or classified listings site. | `web`, `directory`, `listings`, `search` | code-reviewer, seo-advisor | Low |
| 23 | `web_app_survey` | Survey/Form Builder | Create and manage surveys, forms, and collect responses. | `web`, `survey`, `forms`, `data-collection` | code-reviewer, ux-reviewer | Low |
| 24 | `web_app_event` | Event Management | Event creation, ticketing, registration, and attendee management. | `web`, `events`, `ticketing`, `registration` | code-reviewer, ux-reviewer | Low |
| 25 | `web_app_streaming` | Streaming Platform | Video/audio streaming with live broadcasts and on-demand content. | `web`, `streaming`, `video`, `media` | code-reviewer, performance-reviewer | Low |

---

## Software Development - Backend (20)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 26 | `api_rest` | REST API Service | RESTful backend service with CRUD operations, authentication, and documentation. | `backend`, `api`, `rest`, `server` | code-reviewer, api-designer, security-reviewer | High |
| 27 | `api_graphql` | GraphQL API | GraphQL server with schema, resolvers, and subscriptions. | `backend`, `api`, `graphql`, `server` | code-reviewer, api-designer, schema-reviewer | Medium |
| 28 | `api_grpc` | gRPC Service | High-performance RPC service with Protocol Buffers. | `backend`, `api`, `grpc`, `protobuf` | code-reviewer, api-designer | Low |
| 29 | `api_websocket` | WebSocket Server | Real-time bidirectional communication server for chat, notifications, or live updates. | `backend`, `websocket`, `realtime`, `server` | code-reviewer, performance-reviewer | Medium |
| 30 | `api_gateway` | API Gateway | Central gateway for routing, authentication, rate limiting, and API management. | `backend`, `gateway`, `api`, `routing` | code-reviewer, security-reviewer | Medium |
| 31 | `microservice` | Microservice | Single-purpose service in a distributed system with defined boundaries. | `backend`, `microservice`, `docker`, `distributed` | code-reviewer, architect | High |
| 32 | `serverless` | Serverless Functions | AWS Lambda, Vercel, Cloudflare Workers, or Azure Functions. | `serverless`, `cloud`, `functions`, `faas` | code-reviewer, cloud-reviewer | High |
| 33 | `backend_monolith` | Monolithic Backend | Traditional monolithic server application with all features in one codebase. | `backend`, `monolith`, `server`, `traditional` | code-reviewer, architect | Medium |
| 34 | `backend_queue` | Message Queue System | Event-driven system with RabbitMQ, Kafka, or SQS for async processing. | `backend`, `queue`, `messaging`, `async` | code-reviewer, architect | Medium |
| 35 | `backend_scheduler` | Job Scheduler | Background job processing with cron jobs, task queues, and scheduled tasks. | `backend`, `scheduler`, `jobs`, `cron` | code-reviewer, reliability-reviewer | Medium |
| 36 | `backend_auth` | Authentication Service | Dedicated auth service with OAuth, SSO, JWT, and user management. | `backend`, `auth`, `security`, `identity` | code-reviewer, security-reviewer | High |
| 37 | `backend_payment` | Payment Service | Payment processing integration with Stripe, PayPal, or custom billing. | `backend`, `payments`, `billing`, `stripe` | code-reviewer, security-reviewer | Medium |
| 38 | `backend_notification` | Notification Service | Email, SMS, push notification delivery and management service. | `backend`, `notifications`, `email`, `push` | code-reviewer, reliability-reviewer | Medium |
| 39 | `backend_search` | Search Service | Full-text search with Elasticsearch, Algolia, or Meilisearch. | `backend`, `search`, `elasticsearch`, `indexing` | code-reviewer, performance-reviewer | Medium |
| 40 | `backend_file_storage` | File Storage Service | File upload, storage, processing, and CDN delivery service. | `backend`, `storage`, `files`, `cdn` | code-reviewer, security-reviewer | Medium |
| 41 | `backend_cache` | Caching Layer | Redis or Memcached caching service for performance optimization. | `backend`, `cache`, `redis`, `performance` | code-reviewer, performance-reviewer | Low |
| 42 | `backend_analytics` | Analytics Backend | Event tracking, metrics collection, and analytics processing. | `backend`, `analytics`, `metrics`, `tracking` | code-reviewer, data-reviewer | Medium |
| 43 | `backend_cms_headless` | Headless CMS Backend | Content API backend for headless CMS architecture. | `backend`, `cms`, `headless`, `content-api` | code-reviewer, api-designer | Medium |
| 44 | `backend_realtime` | Real-time Backend | Real-time data sync with Firebase, Supabase, or custom solutions. | `backend`, `realtime`, `sync`, `live` | code-reviewer, performance-reviewer | Medium |
| 45 | `backend_batch` | Batch Processing | Large-scale batch data processing and ETL jobs. | `backend`, `batch`, `processing`, `etl` | code-reviewer, data-reviewer | Low |

---

## Software Development - Mobile (12)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 46 | `mobile_react_native` | React Native App | Cross-platform mobile app for iOS and Android using React Native. | `mobile`, `react-native`, `ios`, `android`, `javascript` | code-reviewer, mobile-ux-reviewer | High |
| 47 | `mobile_flutter` | Flutter App | Cross-platform mobile app using Dart and Flutter framework. | `mobile`, `flutter`, `dart`, `ios`, `android` | code-reviewer, mobile-ux-reviewer | Medium |
| 48 | `mobile_native_ios` | Native iOS App | Native iOS application using Swift and SwiftUI. | `mobile`, `ios`, `swift`, `swiftui` | code-reviewer, mobile-ux-reviewer | Medium |
| 49 | `mobile_native_android` | Native Android App | Native Android application using Kotlin and Jetpack Compose. | `mobile`, `android`, `kotlin`, `jetpack` | code-reviewer, mobile-ux-reviewer | Medium |
| 50 | `mobile_expo` | Expo App | React Native app with Expo for rapid development and easy deployment. | `mobile`, `expo`, `react-native`, `rapid` | code-reviewer, mobile-ux-reviewer | High |
| 51 | `mobile_ionic` | Ionic App | Hybrid mobile app using Ionic framework with Angular, React, or Vue. | `mobile`, `ionic`, `hybrid`, `capacitor` | code-reviewer, mobile-ux-reviewer | Low |
| 52 | `mobile_pwa` | Mobile PWA | Progressive web app optimized for mobile with native-like experience. | `mobile`, `pwa`, `web`, `installable` | code-reviewer, mobile-ux-reviewer | Medium |
| 53 | `mobile_game` | Mobile Game | Mobile game for iOS/Android with game engine or custom implementation. | `mobile`, `game`, `ios`, `android` | code-reviewer, game-designer | Low |
| 54 | `mobile_widget` | Mobile Widget | iOS or Android home screen widget with glanceable information. | `mobile`, `widget`, `ios`, `android` | code-reviewer, mobile-ux-reviewer | Low |
| 55 | `mobile_watch` | Smartwatch App | Apple Watch or Wear OS application. | `mobile`, `watch`, `wearable`, `ios`, `android` | code-reviewer, mobile-ux-reviewer | Low |
| 56 | `mobile_tv` | TV App | Apple TV, Android TV, or Fire TV application. | `mobile`, `tv`, `streaming`, `media` | code-reviewer, ux-reviewer | Low |
| 57 | `mobile_ar` | AR Mobile App | Augmented reality app with ARKit or ARCore. | `mobile`, `ar`, `augmented-reality`, `camera` | code-reviewer, 3d-reviewer | Low |

---

## Software Development - Desktop (8)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 58 | `desktop_electron` | Electron Desktop App | Cross-platform desktop application using Electron and web technologies. | `desktop`, `electron`, `javascript`, `cross-platform` | code-reviewer, security-reviewer | Medium |
| 59 | `desktop_tauri` | Tauri Desktop App | Lightweight desktop app with Rust backend and web frontend. | `desktop`, `tauri`, `rust`, `cross-platform` | code-reviewer, rust-reviewer | Medium |
| 60 | `desktop_qt` | Qt Desktop App | Cross-platform native app with Qt framework in C++ or Python. | `desktop`, `qt`, `cpp`, `python`, `native` | code-reviewer, cpp-reviewer | Low |
| 61 | `desktop_native_windows` | Native Windows App | Windows application with WPF, WinUI, or Win32. | `desktop`, `windows`, `wpf`, `native` | code-reviewer, windows-reviewer | Low |
| 62 | `desktop_native_macos` | Native macOS App | macOS application with SwiftUI or AppKit. | `desktop`, `macos`, `swift`, `native` | code-reviewer, macos-reviewer | Low |
| 63 | `desktop_native_linux` | Native Linux App | Linux application with GTK or Qt. | `desktop`, `linux`, `gtk`, `native` | code-reviewer, linux-reviewer | Low |
| 64 | `desktop_flutter` | Flutter Desktop App | Cross-platform desktop app using Flutter. | `desktop`, `flutter`, `dart`, `cross-platform` | code-reviewer, flutter-reviewer | Low |
| 65 | `desktop_utility` | Desktop Utility | System utility, menu bar app, or background service. | `desktop`, `utility`, `system`, `background` | code-reviewer, ux-reviewer | Medium |

---

## Software Development - Extensions & Plugins (12)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 66 | `browser_extension` | Browser Extension | Chrome, Firefox, or Safari extension with popup, background scripts, and content scripts. | `browser`, `extension`, `javascript`, `chrome`, `firefox` | code-reviewer, security-reviewer | Medium |
| 67 | `vscode_extension` | VS Code Extension | Extension for Visual Studio Code with commands, views, and language support. | `vscode`, `extension`, `developer-tools`, `typescript` | code-reviewer, extension-reviewer | Medium |
| 68 | `jetbrains_plugin` | JetBrains Plugin | Plugin for IntelliJ IDEA, WebStorm, PyCharm, or other JetBrains IDEs. | `jetbrains`, `plugin`, `java`, `ide` | code-reviewer, extension-reviewer | Low |
| 69 | `vim_plugin` | Vim/Neovim Plugin | Plugin for Vim or Neovim editor. | `vim`, `neovim`, `plugin`, `lua` | code-reviewer, extension-reviewer | Low |
| 70 | `obsidian_plugin` | Obsidian Plugin | Plugin for Obsidian note-taking application. | `obsidian`, `plugin`, `notes`, `typescript` | code-reviewer, extension-reviewer | Medium |
| 71 | `notion_integration` | Notion Integration | Integration or connector for Notion workspace. | `notion`, `integration`, `api`, `productivity` | code-reviewer, api-designer | Medium |
| 72 | `figma_plugin` | Figma Plugin | Plugin for Figma design tool. | `figma`, `plugin`, `design`, `ui` | code-reviewer, extension-reviewer | Low |
| 73 | `wordpress_plugin` | WordPress Plugin | Custom WordPress plugin with admin pages and shortcodes. | `wordpress`, `plugin`, `php`, `cms` | code-reviewer, php-reviewer | Medium |
| 74 | `shopify_app` | Shopify App | E-commerce app for Shopify stores. | `shopify`, `app`, `ecommerce`, `integration` | code-reviewer, api-designer | Medium |
| 75 | `salesforce_app` | Salesforce App | Custom Salesforce application or Lightning component. | `salesforce`, `app`, `crm`, `apex` | code-reviewer, salesforce-reviewer | Low |
| 76 | `slack_app` | Slack App | Slack app with slash commands, modals, and workflows. | `slack`, `app`, `integration`, `workflow` | code-reviewer, api-designer | Medium |
| 77 | `github_action` | GitHub Action | Custom GitHub Action for CI/CD workflows. | `github`, `action`, `ci`, `automation` | code-reviewer, devops-reviewer | High |

---

## Software Development - Bots & Automation (10)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 78 | `discord_bot` | Discord Bot | Bot for Discord servers with slash commands, events, and integrations. | `bot`, `discord`, `automation`, `javascript`, `python` | code-reviewer, bot-behavior-reviewer | Medium |
| 79 | `slack_bot` | Slack Bot | Bot for Slack workspaces with slash commands, interactive messages, and workflows. | `bot`, `slack`, `automation`, `integration` | code-reviewer, bot-behavior-reviewer | Medium |
| 80 | `telegram_bot` | Telegram Bot | Bot for Telegram with commands, inline queries, and webhooks. | `bot`, `telegram`, `automation`, `python` | code-reviewer, bot-behavior-reviewer | Low |
| 81 | `twitter_bot` | Twitter/X Bot | Automated Twitter/X posting, replies, and engagement. | `bot`, `twitter`, `social`, `automation` | code-reviewer, bot-behavior-reviewer | Low |
| 82 | `whatsapp_bot` | WhatsApp Bot | WhatsApp Business API bot for customer support or notifications. | `bot`, `whatsapp`, `messaging`, `business` | code-reviewer, bot-behavior-reviewer | Low |
| 83 | `web_scraper` | Web Scraper | Automated web scraping with data extraction and storage. | `scraper`, `automation`, `data`, `python` | code-reviewer, ethics-reviewer | Medium |
| 84 | `automation_script` | Automation Script | General purpose automation scripts for repetitive tasks. | `automation`, `script`, `python`, `bash` | code-reviewer | High |
| 85 | `rpa_workflow` | RPA Workflow | Robotic Process Automation workflow for business processes. | `rpa`, `automation`, `workflow`, `business` | code-reviewer, process-reviewer | Low |
| 86 | `email_automation` | Email Automation | Automated email sequences, triggers, and campaigns. | `email`, `automation`, `marketing`, `workflow` | code-reviewer | Low |
| 87 | `social_automation` | Social Media Automation | Scheduled posting, engagement, and analytics across social platforms. | `social`, `automation`, `scheduling`, `marketing` | code-reviewer, ethics-reviewer | Low |

---

## Software Development - Libraries & SDKs (10)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 88 | `npm_package` | NPM Package | Reusable JavaScript/TypeScript library published to NPM registry. | `library`, `npm`, `javascript`, `typescript`, `package` | code-reviewer, api-designer, docs-reviewer | High |
| 89 | `python_package` | Python Package | Reusable Python library published to PyPI registry. | `library`, `pypi`, `python`, `package` | code-reviewer, api-designer, docs-reviewer | Medium |
| 90 | `rust_crate` | Rust Crate | Reusable Rust library published to crates.io. | `library`, `rust`, `crate`, `package` | code-reviewer, rust-reviewer | Low |
| 91 | `go_module` | Go Module | Reusable Go library as a Go module. | `library`, `go`, `module`, `package` | code-reviewer, go-reviewer | Low |
| 92 | `ruby_gem` | Ruby Gem | Reusable Ruby library published to RubyGems. | `library`, `ruby`, `gem`, `package` | code-reviewer, ruby-reviewer | Low |
| 93 | `php_package` | PHP Package | Reusable PHP library published to Packagist. | `library`, `php`, `composer`, `package` | code-reviewer, php-reviewer | Low |
| 94 | `sdk_api` | API SDK | Client SDK for consuming an API in multiple languages. | `sdk`, `api`, `client`, `library` | code-reviewer, api-designer | Medium |
| 95 | `ui_component_library` | UI Component Library | Reusable UI component library (React, Vue, Svelte). | `library`, `ui`, `components`, `design-system` | code-reviewer, ui-reviewer | Medium |
| 96 | `framework` | Framework | Full-featured framework for building applications. | `framework`, `library`, `architecture` | code-reviewer, architect | Low |
| 97 | `cli_framework` | CLI Framework | Framework or toolkit for building CLI applications. | `cli`, `framework`, `library`, `terminal` | code-reviewer, api-designer | Low |

---

## Data & AI (25)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 98 | `ml_model` | Machine Learning Model | Train, evaluate, and deploy ML models. Classification, regression, or clustering. | `ml`, `python`, `data-science`, `model` | code-reviewer, ml-reviewer, data-validator | High |
| 99 | `ml_deep_learning` | Deep Learning Project | Neural networks with PyTorch or TensorFlow. CNNs, RNNs, Transformers. | `ml`, `deep-learning`, `pytorch`, `tensorflow`, `neural-network` | code-reviewer, ml-reviewer | Medium |
| 100 | `data_pipeline` | Data Pipeline | ETL/ELT data processing pipeline with scheduling and monitoring. | `data`, `etl`, `pipeline`, `airflow`, `dbt` | code-reviewer, data-engineer-reviewer | High |
| 101 | `data_analysis` | Data Analysis Project | Exploratory data analysis with Jupyter notebooks and visualizations. | `data`, `analysis`, `jupyter`, `pandas`, `visualization` | data-analyst, visualization-reviewer | High |
| 102 | `ai_chatbot` | AI Chatbot | Conversational AI using LLMs with context management and tool use. | `ai`, `chatbot`, `llm`, `conversational` | code-reviewer, prompt-engineer | High |
| 103 | `ai_agent` | AI Agent System | Autonomous AI agent with planning, memory, and tool integration. | `ai`, `agent`, `llm`, `autonomous` | code-reviewer, prompt-engineer, safety-reviewer | High |
| 104 | `rag_system` | RAG Application | Retrieval-Augmented Generation with vector databases and embeddings. | `ai`, `rag`, `embeddings`, `vector-db`, `llm` | code-reviewer, prompt-engineer | High |
| 105 | `computer_vision` | Computer Vision | Image/video processing, object detection, or image generation. | `cv`, `ml`, `python`, `image`, `video` | code-reviewer, ml-reviewer | Medium |
| 106 | `nlp_project` | NLP Project | Natural language processing: sentiment analysis, NER, text classification. | `nlp`, `ml`, `text`, `python` | code-reviewer, ml-reviewer | Medium |
| 107 | `analytics_dashboard` | Analytics Dashboard | Interactive data visualization dashboard with charts and filters. | `analytics`, `visualization`, `dashboard`, `bi` | code-reviewer, visualization-reviewer | Medium |
| 108 | `recommendation_engine` | Recommendation System | Personalized recommendations using collaborative or content-based filtering. | `ml`, `recommendations`, `personalization`, `data` | code-reviewer, ml-reviewer | Medium |
| 109 | `ml_ops` | MLOps Pipeline | ML model lifecycle management, training pipelines, and deployment automation. | `mlops`, `ml`, `pipeline`, `deployment` | code-reviewer, devops-reviewer | Medium |
| 110 | `llm_fine_tuning` | LLM Fine-tuning | Fine-tune large language models for specific tasks or domains. | `llm`, `fine-tuning`, `ml`, `training` | code-reviewer, ml-reviewer | Medium |
| 111 | `vector_database` | Vector Database System | Vector storage and similarity search implementation. | `vector`, `database`, `embeddings`, `search` | code-reviewer, data-reviewer | Medium |
| 112 | `data_warehouse` | Data Warehouse | Centralized data warehouse with dimensional modeling. | `data`, `warehouse`, `analytics`, `dimensional` | code-reviewer, data-reviewer | Medium |
| 113 | `data_lake` | Data Lake | Scalable data lake architecture for raw and processed data. | `data`, `lake`, `storage`, `big-data` | code-reviewer, data-reviewer | Low |
| 114 | `streaming_analytics` | Streaming Analytics | Real-time data processing with Kafka, Flink, or Spark Streaming. | `streaming`, `real-time`, `kafka`, `analytics` | code-reviewer, data-reviewer | Low |
| 115 | `bi_reporting` | BI Reporting | Business intelligence reports and dashboards with BI tools. | `bi`, `reporting`, `analytics`, `visualization` | code-reviewer, visualization-reviewer | Medium |
| 116 | `forecasting` | Time Series Forecasting | Predictive models for time series data and forecasting. | `ml`, `forecasting`, `time-series`, `prediction` | code-reviewer, ml-reviewer | Medium |
| 117 | `anomaly_detection` | Anomaly Detection | Detect anomalies and outliers in data streams or datasets. | `ml`, `anomaly`, `detection`, `monitoring` | code-reviewer, ml-reviewer | Medium |
| 118 | `ai_image_gen` | AI Image Generation | Image generation with Stable Diffusion, DALL-E, or custom models. | `ai`, `image`, `generation`, `diffusion` | code-reviewer, ml-reviewer | Low |
| 119 | `ai_voice` | AI Voice/Speech | Speech recognition, text-to-speech, or voice cloning. | `ai`, `voice`, `speech`, `tts`, `stt` | code-reviewer, ml-reviewer | Low |
| 120 | `ai_video` | AI Video Processing | Video analysis, generation, or enhancement with AI. | `ai`, `video`, `processing`, `ml` | code-reviewer, ml-reviewer | Low |
| 121 | `knowledge_graph` | Knowledge Graph | Build and query knowledge graphs for structured data relationships. | `knowledge-graph`, `data`, `ontology`, `graph` | code-reviewer, data-reviewer | Low |
| 122 | `ai_multimodal` | Multimodal AI | AI systems combining text, image, audio, or video modalities. | `ai`, `multimodal`, `llm`, `vision` | code-reviewer, ml-reviewer | Low |

---

## Content & Creative (20)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 123 | `book_fiction` | Fiction Book | Novel, short stories, novellas, or creative fiction writing. | `writing`, `book`, `fiction`, `creative`, `storytelling` | editor, story-consultant, researcher | High |
| 124 | `book_nonfiction` | Non-Fiction Book | Educational, memoir, self-help, or informational book. | `writing`, `book`, `nonfiction`, `educational` | editor, fact-checker, researcher | High |
| 125 | `book_technical` | Technical Book | Programming tutorials, technical guides, or documentation books. | `writing`, `book`, `technical`, `programming`, `tutorial` | editor, technical-reviewer, code-reviewer | Medium |
| 126 | `book_childrens` | Children's Book | Picture books, early readers, or middle-grade fiction. | `writing`, `book`, `children`, `illustration` | editor, story-consultant | Low |
| 127 | `book_poetry` | Poetry Collection | Poetry anthology or collection with thematic organization. | `writing`, `poetry`, `creative`, `literary` | editor, literary-reviewer | Low |
| 128 | `blog_personal` | Personal Blog | Personal blog with articles, essays, or journal entries. | `writing`, `blog`, `content`, `personal` | editor, seo-advisor | High |
| 129 | `blog_technical` | Technical Blog | Programming tutorials, tech articles, and developer content. | `writing`, `blog`, `technical`, `tutorial`, `developer` | editor, technical-reviewer, code-reviewer | High |
| 130 | `blog_business` | Business Blog | Company blog with industry insights, news, and thought leadership. | `writing`, `blog`, `business`, `marketing` | editor, seo-advisor | Medium |
| 131 | `documentation` | Technical Documentation | API docs, user guides, wikis, and knowledge bases. | `docs`, `technical-writing`, `api`, `guide` | editor, technical-reviewer, docs-reviewer | High |
| 132 | `course_content` | Online Course | Educational course with modules, lessons, quizzes, and projects. | `education`, `course`, `content`, `learning`, `tutorial` | editor, curriculum-designer, researcher | Medium |
| 133 | `podcast_show` | Podcast | Audio content planning, episode scripting, and show notes. | `podcast`, `audio`, `content`, `script`, `media` | editor, researcher, content-strategist | Medium |
| 134 | `video_content` | Video Content | YouTube videos, tutorials, or video scripts with outlines. | `video`, `youtube`, `content`, `script`, `tutorial` | editor, researcher, content-strategist | Medium |
| 135 | `newsletter` | Newsletter | Email newsletter with regular editions and subscriber management. | `newsletter`, `email`, `content`, `marketing` | editor, content-strategist | Medium |
| 136 | `screenplay` | Screenplay/Script | Film, TV, or web series screenplay with proper formatting. | `writing`, `screenplay`, `script`, `film`, `tv` | editor, story-consultant | Low |
| 137 | `comic_graphic_novel` | Comic/Graphic Novel | Comic book or graphic novel with script and panel planning. | `writing`, `comic`, `graphic-novel`, `visual` | editor, story-consultant | Low |
| 138 | `game_narrative` | Game Narrative | Story, dialogue, and narrative design for video games. | `writing`, `game`, `narrative`, `dialogue` | editor, story-consultant, game-designer | Low |
| 139 | `copywriting` | Marketing Copy | Landing pages, ads, email campaigns, and sales copy. | `marketing`, `copy`, `content`, `sales` | editor, marketing-reviewer | Medium |
| 140 | `social_content` | Social Media Content | Social media strategy, posts, and content calendar. | `social`, `content`, `marketing`, `strategy` | editor, content-strategist | Medium |
| 141 | `ebook` | E-book | Digital-first book with interactive elements and multimedia. | `writing`, `ebook`, `digital`, `interactive` | editor, technical-reviewer | Low |
| 142 | `whitepaper` | Whitepaper | Industry whitepaper with research, analysis, and recommendations. | `writing`, `whitepaper`, `research`, `business` | editor, researcher | Medium |

---

## Business & Productivity (18)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 143 | `business_plan` | Business Plan | Startup or business planning with market analysis and financials. | `business`, `planning`, `strategy`, `startup` | editor, researcher, business-analyst | High |
| 144 | `product_spec` | Product Specification | PRDs, feature specs, user stories, and product roadmaps. | `product`, `planning`, `spec`, `prd`, `roadmap` | editor, product-reviewer | High |
| 145 | `research_academic` | Academic Research | Thesis, dissertations, academic papers, and literature reviews. | `research`, `academic`, `writing`, `thesis`, `paper` | editor, researcher, citation-checker | Medium |
| 146 | `research_market` | Market Research | Competitive analysis, market studies, and industry reports. | `research`, `market`, `business`, `analysis`, `competitive` | researcher, analyst, editor | Medium |
| 147 | `grant_proposal` | Grant Proposal | Funding applications, grant proposals, and project proposals. | `grant`, `proposal`, `writing`, `funding` | editor, researcher, proposal-reviewer | Medium |
| 148 | `legal_docs` | Legal Documents | Contracts, terms of service, privacy policies, and compliance docs. | `legal`, `documents`, `compliance`, `contracts` | editor, legal-reviewer | Low |
| 149 | `project_management` | Project Management | Task tracking, sprint planning, roadmaps, and team coordination. | `project`, `management`, `planning`, `agile`, `scrum` | project-planner, task-organizer | Medium |
| 150 | `consulting_report` | Consulting Report | Client deliverables, analysis reports, and recommendations. | `consulting`, `report`, `business`, `analysis` | editor, analyst, researcher | Low |
| 151 | `presentation` | Presentation | Slide decks, pitch decks, and visual presentations. | `presentation`, `slides`, `pitch`, `visual` | editor, designer, content-strategist | Medium |
| 152 | `sop_documentation` | Standard Operating Procedures | Process documentation, SOPs, and operational guides. | `sop`, `process`, `documentation`, `operations` | editor, process-reviewer | Low |
| 153 | `pitch_deck` | Pitch Deck | Investor pitch deck for fundraising and partnerships. | `pitch`, `deck`, `fundraising`, `startup` | editor, business-analyst | High |
| 154 | `financial_model` | Financial Model | Financial projections, budgets, and financial analysis. | `finance`, `model`, `projections`, `budget` | analyst, financial-reviewer | Medium |
| 155 | `strategic_plan` | Strategic Plan | Long-term strategic planning with goals and initiatives. | `strategy`, `planning`, `business`, `goals` | editor, business-analyst | Medium |
| 156 | `case_study` | Case Study | Customer success stories and case study documents. | `case-study`, `marketing`, `customer`, `success` | editor, marketing-reviewer | Medium |
| 157 | `rfp_response` | RFP Response | Request for proposal responses and bid documents. | `rfp`, `proposal`, `bid`, `business` | editor, proposal-reviewer | Low |
| 158 | `employee_handbook` | Employee Handbook | Company policies, procedures, and employee guidelines. | `hr`, `handbook`, `policies`, `documentation` | editor, hr-reviewer | Low |
| 159 | `training_materials` | Training Materials | Employee training content, guides, and assessments. | `training`, `education`, `hr`, `materials` | editor, curriculum-designer | Low |
| 160 | `meeting_notes` | Meeting Notes System | Structured meeting notes, action items, and follow-ups. | `meetings`, `notes`, `productivity`, `documentation` | editor, task-organizer | Low |

---

## DevOps & Infrastructure (15)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 161 | `devops_infra` | DevOps/Infrastructure | Terraform, Kubernetes, CI/CD pipelines, and cloud infrastructure. | `devops`, `infrastructure`, `cloud`, `terraform`, `kubernetes` | code-reviewer, security-reviewer, infra-reviewer | High |
| 162 | `cicd_pipeline` | CI/CD Pipeline | Continuous integration and deployment pipeline setup. | `cicd`, `pipeline`, `automation`, `github-actions`, `jenkins` | code-reviewer, devops-reviewer | High |
| 163 | `kubernetes_config` | Kubernetes Configuration | K8s manifests, Helm charts, and cluster configuration. | `kubernetes`, `k8s`, `helm`, `containers` | code-reviewer, devops-reviewer | Medium |
| 164 | `terraform_infra` | Terraform Infrastructure | Infrastructure as Code with Terraform for cloud resources. | `terraform`, `iac`, `cloud`, `infrastructure` | code-reviewer, devops-reviewer | High |
| 165 | `docker_compose` | Docker Compose Setup | Multi-container Docker application setup. | `docker`, `compose`, `containers`, `local-dev` | code-reviewer, devops-reviewer | High |
| 166 | `ansible_playbooks` | Ansible Playbooks | Server configuration and automation with Ansible. | `ansible`, `automation`, `configuration`, `servers` | code-reviewer, devops-reviewer | Medium |
| 167 | `monitoring_setup` | Monitoring System | Observability stack with Prometheus, Grafana, or Datadog. | `monitoring`, `observability`, `prometheus`, `grafana` | code-reviewer, devops-reviewer | Medium |
| 168 | `logging_system` | Logging System | Centralized logging with ELK stack, Loki, or cloud logging. | `logging`, `elk`, `observability`, `debugging` | code-reviewer, devops-reviewer | Medium |
| 169 | `alerting_system` | Alerting System | Alert rules, escalation policies, and incident management. | `alerting`, `monitoring`, `incidents`, `pagerduty` | code-reviewer, devops-reviewer | Medium |
| 170 | `backup_disaster_recovery` | Backup & DR | Backup strategies, disaster recovery, and business continuity. | `backup`, `disaster-recovery`, `resilience`, `data` | code-reviewer, devops-reviewer | Medium |
| 171 | `security_hardening` | Security Hardening | Server and infrastructure security hardening configurations. | `security`, `hardening`, `compliance`, `infrastructure` | code-reviewer, security-reviewer | Medium |
| 172 | `load_balancer` | Load Balancer Setup | Load balancing configuration with Nginx, HAProxy, or cloud LBs. | `load-balancer`, `nginx`, `haproxy`, `scaling` | code-reviewer, devops-reviewer | Low |
| 173 | `cdn_config` | CDN Configuration | Content delivery network setup and optimization. | `cdn`, `performance`, `caching`, `edge` | code-reviewer, devops-reviewer | Low |
| 174 | `dns_management` | DNS Management | DNS configuration, domain management, and routing. | `dns`, `domains`, `routing`, `infrastructure` | code-reviewer, devops-reviewer | Low |
| 175 | `secrets_management` | Secrets Management | Vault, AWS Secrets Manager, or secrets rotation setup. | `secrets`, `security`, `vault`, `credentials` | code-reviewer, security-reviewer | Medium |

---

## Specialized & Niche (25)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 176 | `game_2d` | 2D Game | 2D video game with sprites, physics, and game logic. | `game`, `gamedev`, `2d`, `creative` | code-reviewer, game-designer | Medium |
| 177 | `game_3d` | 3D Game | 3D video game with Unity, Unreal, or Godot engine. | `game`, `gamedev`, `3d`, `unity`, `unreal` | code-reviewer, game-designer | Low |
| 178 | `game_web` | Web Game | Browser-based game with HTML5 Canvas, WebGL, or Phaser. | `game`, `web`, `html5`, `phaser` | code-reviewer, game-designer | Low |
| 179 | `embedded_iot` | Embedded/IoT | Arduino, Raspberry Pi, ESP32, and IoT device projects. | `embedded`, `iot`, `hardware`, `arduino`, `raspberry-pi` | code-reviewer, hardware-reviewer | Medium |
| 180 | `smart_contract` | Smart Contract | Blockchain smart contracts with Solidity, Rust, or Move. | `blockchain`, `web3`, `solidity`, `smart-contract`, `defi` | code-reviewer, security-auditor | Medium |
| 181 | `dapp` | Decentralized App | Web3 decentralized application with wallet integration. | `web3`, `dapp`, `blockchain`, `ethereum` | code-reviewer, security-auditor | Low |
| 182 | `nft_project` | NFT Project | NFT minting, marketplace, or collection management. | `nft`, `web3`, `blockchain`, `marketplace` | code-reviewer, security-auditor | Low |
| 183 | `security_audit` | Security Audit | Penetration testing, vulnerability assessment, and security review. | `security`, `audit`, `pentest`, `vulnerability` | security-auditor, code-reviewer | Medium |
| 184 | `api_integration` | API Integration | Connect and orchestrate multiple third-party APIs. | `integration`, `api`, `automation`, `orchestration` | code-reviewer, api-designer | Medium |
| 185 | `migration_project` | System Migration | Database migration, cloud migration, or platform modernization. | `migration`, `legacy`, `modernization`, `database`, `cloud` | code-reviewer, architect, migration-planner | Medium |
| 186 | `performance_optimization` | Performance Optimization | Speed optimization, profiling, and efficiency improvements. | `performance`, `optimization`, `profiling`, `speed` | code-reviewer, performance-analyst | Medium |
| 187 | `open_source` | Open Source Project | Community-driven OSS with contributions, issues, and releases. | `oss`, `community`, `collaboration`, `github` | code-reviewer, community-manager, docs-reviewer | High |
| 188 | `accessibility_audit` | Accessibility Audit | WCAG compliance audit and accessibility improvements. | `accessibility`, `a11y`, `wcag`, `audit` | code-reviewer, accessibility-reviewer | Medium |
| 189 | `localization` | Localization/i18n | Internationalization and localization for multiple languages. | `i18n`, `localization`, `translation`, `international` | code-reviewer, localization-reviewer | Low |
| 190 | `seo_optimization` | SEO Project | Search engine optimization audit and improvements. | `seo`, `marketing`, `optimization`, `search` | code-reviewer, seo-advisor | Medium |
| 191 | `reverse_engineering` | Reverse Engineering | Analyze and understand existing systems or binaries. | `reverse-engineering`, `analysis`, `security` | code-reviewer, security-reviewer | Low |
| 192 | `compiler_interpreter` | Compiler/Interpreter | Build a programming language compiler or interpreter. | `compiler`, `interpreter`, `language`, `parsing` | code-reviewer, language-designer | Low |
| 193 | `os_kernel` | Operating System/Kernel | OS kernel, bootloader, or systems programming project. | `os`, `kernel`, `systems`, `low-level` | code-reviewer, systems-reviewer | Low |
| 194 | `hardware_design` | Hardware Design | PCB design, FPGA, or hardware schematics. | `hardware`, `pcb`, `fpga`, `electronics` | code-reviewer, hardware-reviewer | Low |
| 195 | `robotics` | Robotics Project | Robot control, sensors, and autonomous systems. | `robotics`, `automation`, `sensors`, `control` | code-reviewer, robotics-reviewer | Low |
| 196 | `vr_project` | VR Application | Virtual reality application or experience. | `vr`, `virtual-reality`, `3d`, `immersive` | code-reviewer, 3d-reviewer | Low |
| 197 | `ar_project` | AR Application | Augmented reality application beyond mobile (HoloLens, Magic Leap). | `ar`, `augmented-reality`, `spatial`, `immersive` | code-reviewer, 3d-reviewer | Low |
| 198 | `simulation` | Simulation | Physics simulation, traffic simulation, or agent-based modeling. | `simulation`, `modeling`, `physics`, `agents` | code-reviewer, simulation-reviewer | Low |
| 199 | `crypto_trading` | Crypto Trading Bot | Cryptocurrency trading algorithms and automation. | `crypto`, `trading`, `automation`, `finance` | code-reviewer, finance-reviewer | Low |
| 200 | `scientific_computing` | Scientific Computing | Scientific simulations, numerical methods, or research software. | `scientific`, `computing`, `research`, `numerical` | code-reviewer, scientific-reviewer | Low |

---

## Personal & Lifestyle (10)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 201 | `personal_finance` | Personal Finance Tracker | Budget tracking, expense management, financial goals, and investment monitoring. | `personal`, `finance`, `budget`, `money`, `tracking` | code-reviewer, ux-reviewer, security-reviewer | Medium |
| 202 | `habit_tracker` | Habit Tracking System | Daily habits, streaks, progress visualization, and behavior analytics. | `personal`, `habits`, `productivity`, `tracking`, `goals` | code-reviewer, ux-reviewer | Medium |
| 203 | `journal_diary` | Digital Journal | Daily journaling, mood tracking, reflection prompts, and memory preservation. | `personal`, `journal`, `writing`, `mood`, `reflection` | editor, ux-reviewer | Medium |
| 204 | `recipe_cookbook` | Recipe Collection | Personal cookbook with recipes, meal planning, shopping lists, and nutrition info. | `personal`, `recipes`, `cooking`, `meal-planning`, `food` | editor, ux-reviewer | Low |
| 205 | `fitness_tracker` | Fitness Log | Workout tracking, exercise routines, progress photos, and fitness goals. | `personal`, `fitness`, `health`, `workout`, `exercise` | code-reviewer, ux-reviewer | Medium |
| 206 | `travel_planner` | Travel Planning | Trip itineraries, packing lists, travel logs, expense tracking, and bookings. | `personal`, `travel`, `planning`, `itinerary`, `trips` | editor, ux-reviewer | Low |
| 207 | `home_inventory` | Home Inventory | Tracking possessions, warranties, maintenance schedules, and insurance documentation. | `personal`, `inventory`, `home`, `organization`, `assets` | code-reviewer, ux-reviewer | Low |
| 208 | `reading_list` | Reading Tracker | Book tracking, reading notes, reviews, recommendations, and reading goals. | `personal`, `reading`, `books`, `notes`, `reviews` | editor, ux-reviewer | Low |
| 209 | `personal_wiki` | Personal Knowledge Base | Second brain, interconnected notes, personal wiki, and knowledge management. | `personal`, `wiki`, `knowledge`, `notes`, `second-brain` | editor, researcher | Medium |
| 210 | `family_organizer` | Family Organization | Shared schedules, chores, family events, shared lists, and household management. | `personal`, `family`, `scheduling`, `organization`, `household` | code-reviewer, ux-reviewer | Low |

---

## Education & Learning (10)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 211 | `study_notes` | Study Notes System | Organized notes with spaced repetition, tagging, and cross-referencing. | `education`, `notes`, `studying`, `learning`, `organization` | editor, researcher | Medium |
| 212 | `flashcard_deck` | Flashcard Deck | Learning cards with spaced repetition system, progress tracking, and sharing. | `education`, `flashcards`, `memory`, `learning`, `spaced-repetition` | code-reviewer, ux-reviewer | Medium |
| 213 | `language_learning` | Language Learning | Vocabulary building, grammar practice, exercises, and progress tracking. | `education`, `language`, `vocabulary`, `grammar`, `learning` | editor, researcher | Medium |
| 214 | `math_practice` | Math Problem Sets | Mathematical exercises, step-by-step solutions, and skill progression. | `education`, `math`, `practice`, `exercises`, `learning` | code-reviewer, technical-reviewer | Low |
| 215 | `coding_exercises` | Coding Exercises | Programming challenges, solutions, test cases, and skill assessments. | `education`, `coding`, `programming`, `challenges`, `practice` | code-reviewer, technical-reviewer | High |
| 216 | `exam_prep` | Exam Preparation | Study guides, practice tests, revision schedules, and performance analytics. | `education`, `exam`, `studying`, `preparation`, `tests` | editor, researcher | Medium |
| 217 | `teaching_materials` | Teaching Materials | Lesson plans, worksheets, assessments, and classroom resources. | `education`, `teaching`, `lessons`, `curriculum`, `resources` | editor, curriculum-designer | Medium |
| 218 | `tutorial_series` | Tutorial Series | Step-by-step learning content, progressive lessons, and hands-on exercises. | `education`, `tutorial`, `learning`, `content`, `teaching` | editor, technical-reviewer | High |
| 219 | `knowledge_quiz` | Quiz/Assessment | Interactive quizzes, knowledge tests, scoring, and performance feedback. | `education`, `quiz`, `assessment`, `testing`, `interactive` | code-reviewer, ux-reviewer | Low |
| 220 | `curriculum_design` | Curriculum Design | Educational program planning, learning objectives, and course structure. | `education`, `curriculum`, `planning`, `course-design`, `pedagogy` | editor, curriculum-designer, researcher | Low |

---

## Art & Design (8)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 221 | `design_system` | Design System | UI kit, design tokens, component guidelines, and brand consistency documentation. | `design`, `ui`, `tokens`, `components`, `system` | code-reviewer, ui-reviewer, docs-reviewer | High |
| 222 | `brand_identity` | Brand Identity | Logo design, color palettes, typography, brand guidelines, and visual assets. | `design`, `brand`, `identity`, `logo`, `visual` | editor, designer | Medium |
| 223 | `illustration_project` | Illustration Project | Digital art, illustrations, visual assets, and art portfolio management. | `art`, `illustration`, `digital-art`, `visual`, `creative` | editor, designer | Low |
| 224 | `ui_mockup` | UI/UX Mockups | Interface designs, wireframes, prototypes, and user flow documentation. | `design`, `ui`, `ux`, `mockup`, `prototype` | ui-reviewer, ux-reviewer | High |
| 225 | `animation_project` | Animation Project | Motion graphics, animated content, keyframe planning, and timing documentation. | `animation`, `motion`, `graphics`, `video`, `creative` | editor, designer | Low |
| 226 | `3d_modeling` | 3D Modeling | 3D assets, scenes, renders, textures, and model documentation. | `3d`, `modeling`, `rendering`, `assets`, `creative` | code-reviewer, 3d-reviewer | Low |
| 227 | `print_design` | Print Design | Posters, flyers, brochures, packaging, and print-ready file management. | `design`, `print`, `graphic-design`, `layout`, `publishing` | editor, designer | Low |
| 228 | `photography_portfolio` | Photography Portfolio | Photo collection, editing workflows, galleries, and portfolio presentation. | `photography`, `portfolio`, `gallery`, `visual`, `creative` | editor, designer | Low |

---

## Events & Communities (6)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 229 | `event_planning` | Event Planning | Conference, meetup, or celebration planning with schedules, vendors, and logistics. | `events`, `planning`, `conference`, `logistics`, `organization` | editor, project-planner | Medium |
| 230 | `community_management` | Community Management | Discord/Slack community organization, moderation guidelines, and engagement tracking. | `community`, `management`, `discord`, `slack`, `engagement` | editor, community-manager | Medium |
| 231 | `hackathon` | Hackathon Project | Time-boxed competitive project with judging criteria and submission management. | `hackathon`, `competition`, `project`, `event`, `coding` | code-reviewer, project-planner | Medium |
| 232 | `workshop` | Workshop Content | Hands-on workshop materials, exercises, facilitator guides, and participant resources. | `workshop`, `teaching`, `hands-on`, `training`, `materials` | editor, curriculum-designer | Medium |
| 233 | `conference_talk` | Conference Talk | Speaker notes, slides, demos, and presentation preparation materials. | `conference`, `speaking`, `presentation`, `slides`, `talk` | editor, content-strategist | Medium |
| 234 | `meetup_organization` | Meetup Organization | Local meetup planning, venue coordination, and community event content. | `meetup`, `community`, `local`, `events`, `networking` | editor, project-planner | Low |

---

## Health & Wellness (6)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 235 | `meditation_app` | Meditation App | Guided meditation content, mindfulness exercises, and session tracking. | `health`, `meditation`, `mindfulness`, `wellness`, `mental-health` | editor, ux-reviewer | Medium |
| 236 | `therapy_notes` | Therapy/Counseling Notes | Session notes, progress tracking, treatment plans, and therapeutic resources. | `health`, `therapy`, `counseling`, `mental-health`, `notes` | editor, security-reviewer | Low |
| 237 | `nutrition_plan` | Nutrition Planning | Meal planning, calorie tracking, macro management, and dietary guidelines. | `health`, `nutrition`, `diet`, `meal-planning`, `food` | editor, researcher | Low |
| 238 | `sleep_tracker` | Sleep Tracking | Sleep patterns, quality analysis, sleep hygiene tips, and improvement tracking. | `health`, `sleep`, `tracking`, `wellness`, `habits` | code-reviewer, ux-reviewer | Low |
| 239 | `mental_health` | Mental Health Journal | Mood tracking, coping strategies, self-care routines, and wellness resources. | `health`, `mental-health`, `mood`, `self-care`, `wellness` | editor, ux-reviewer | Medium |
| 240 | `healthcare_app` | Healthcare Application | Patient management, medical records, appointment scheduling, and health data. | `health`, `healthcare`, `medical`, `patients`, `records` | code-reviewer, security-reviewer, compliance-reviewer | Medium |

---

## Environment & Sustainability (4)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 241 | `carbon_tracker` | Carbon Footprint Tracker | Environmental impact tracking, emissions calculation, and reduction goals. | `environment`, `carbon`, `sustainability`, `tracking`, `emissions` | code-reviewer, data-reviewer | Medium |
| 242 | `sustainability_report` | Sustainability Report | ESG reporting, environmental metrics, sustainability goals, and impact documentation. | `environment`, `sustainability`, `esg`, `reporting`, `metrics` | editor, analyst, researcher | Medium |
| 243 | `green_energy` | Green Energy Project | Renewable energy monitoring, solar/wind tracking, and energy efficiency analysis. | `environment`, `energy`, `renewable`, `solar`, `monitoring` | code-reviewer, data-reviewer | Low |
| 244 | `conservation_project` | Conservation Project | Wildlife tracking, habitat monitoring, environmental protection, and research data. | `environment`, `conservation`, `wildlife`, `ecology`, `research` | researcher, data-reviewer | Low |

---

## Legal & Compliance (4)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 245 | `compliance_audit` | Compliance Audit | Regulatory compliance checks (GDPR, HIPAA, SOC2), audit trails, and remediation tracking. | `legal`, `compliance`, `audit`, `gdpr`, `hipaa` | code-reviewer, security-reviewer, compliance-reviewer | High |
| 246 | `policy_framework` | Policy Framework | Organizational policies, procedures, governance documents, and policy management. | `legal`, `policy`, `governance`, `procedures`, `documentation` | editor, legal-reviewer | Medium |
| 247 | `risk_assessment` | Risk Assessment | Risk identification, mitigation planning, risk matrices, and assessment documentation. | `legal`, `risk`, `assessment`, `mitigation`, `security` | analyst, security-reviewer | Medium |
| 248 | `incident_response` | Incident Response Plan | Security incident handling procedures, playbooks, communication plans, and post-mortems. | `legal`, `incident`, `security`, `response`, `procedures` | editor, security-reviewer | High |

---

## Creative Non-Code (6)

| # | ID | Title | Description | Tags | Recommended Agents | Priority |
|---|-----|-------|-------------|------|-------------------|----------|
| 249 | `worldbuilding` | Worldbuilding | Fictional world creation for stories/games with lore, maps, cultures, and history. | `creative`, `worldbuilding`, `fiction`, `lore`, `storytelling` | editor, story-consultant, researcher | Medium |
| 250 | `tabletop_rpg` | Tabletop RPG Campaign | D&D/TTRPG campaign management with sessions, characters, encounters, and story arcs. | `creative`, `ttrpg`, `dnd`, `gaming`, `campaign` | editor, story-consultant | Medium |
| 251 | `music_composition` | Music Composition | Song writing, arrangement, lyrics, chord progressions, and music production notes. | `creative`, `music`, `composition`, `songwriting`, `audio` | editor, researcher | Low |
| 252 | `genealogy` | Family History | Genealogy research, family tree building, historical records, and ancestry documentation. | `creative`, `genealogy`, `family`, `history`, `research` | researcher, editor | Low |
| 253 | `diy_project` | DIY/Maker Project | Hardware projects, crafts, home improvement, build documentation, and materials lists. | `creative`, `diy`, `maker`, `hardware`, `crafts` | editor, technical-reviewer | Low |
| 254 | `collection_catalog` | Collection Catalog | Collectibles organization, memorabilia tracking, valuations, and collection documentation. | `creative`, `collection`, `catalog`, `organization`, `hobby` | editor, ux-reviewer | Low |

---

## Project Type Details Schema

When creating full templates for each project type, use this schema:

```yaml
# Frontmatter for project template files
---
id: tpl_{project_type_id}
title: {Title}
description: {One-line description}
tags:
  - {tag1}
  - {tag2}
applicable_to: null  # null means this IS a project type
metadata:
  default_model: anthropic/claude-sonnet-4-20250514
  recommended_agents:
    - {agent1}
    - {agent2}
  recommended_commands:
    - {command1}
    - {command2}
  recommended_tools:
    - {tool1}
  frameworks:
    - {framework1}
    - {framework2}
  languages:
    - {language1}
    - {language2}
---
```

---

## Implementation Priority

### Phase 1: Core Templates (30 templates)
High priority, most commonly used project types:

| # | ID | Rationale |
|---|-----|-----------|
| 1 | `web_app_fullstack` | Most common web development |
| 2 | `api_rest` | Backend services are ubiquitous |
| 3 | `web_app_spa` | Frontend-heavy applications |
| 4 | `web_app_ssr` | SEO-optimized web apps (Next.js, etc.) |
| 5 | `ai_chatbot` | AI/LLM applications growing rapidly |
| 6 | `ai_agent` | Core use case for AgentPod |
| 7 | `rag_system` | Common AI pattern |
| 8 | `cli_tool` | Developer tooling |
| 9 | `npm_package` | Library development |
| 10 | `data_analysis` | Data science workflows |
| 11 | `book_fiction` | Creative writing |
| 12 | `book_nonfiction` | Non-fiction writing |
| 13 | `blog_technical` | Developer content |
| 14 | `documentation` | Technical writing |
| 15 | `devops_infra` | Infrastructure as code |
| 16 | `business_plan` | Business planning |
| 17 | `mobile_react_native` | Cross-platform mobile |
| 18 | `serverless` | Cloud functions |
| 19 | `microservice` | Distributed systems |
| 20 | `github_action` | CI/CD automation |
| 21 | `web_app_landing` | Marketing sites |
| 22 | `product_spec` | Product management |
| 23 | `pitch_deck` | Startup fundraising |
| 24 | `automation_script` | General automation |
| 25 | `open_source` | OSS projects |
| 26 | `design_system` | UI/Design consistency |
| 27 | `ui_mockup` | UX design workflows |
| 28 | `coding_exercises` | Learning & education |
| 29 | `tutorial_series` | Educational content |
| 30 | `compliance_audit` | Enterprise security |

### Phase 2: Extended Templates (60 templates)
Medium priority, common but more specialized:

- **Web**: `web_app_saas`, `web_app_ecommerce`, `web_app_dashboard`, `web_app_pwa`
- **Backend**: `api_graphql`, `api_websocket`, `backend_auth`, `backend_queue`
- **Mobile**: `mobile_flutter`, `mobile_expo`, `mobile_native_ios`
- **Desktop**: `desktop_electron`, `desktop_tauri`
- **Extensions**: `browser_extension`, `vscode_extension`, `obsidian_plugin`, `slack_app`
- **Bots**: `discord_bot`, `slack_bot`, `web_scraper`
- **Libraries**: `python_package`, `ui_component_library`, `sdk_api`
- **AI/Data**: `ml_model`, `data_pipeline`, `ml_ops`, `analytics_dashboard`
- **Content**: `course_content`, `newsletter`, `podcast_show`, `copywriting`
- **Business**: `research_academic`, `research_market`, `case_study`, `financial_model`
- **DevOps**: `cicd_pipeline`, `terraform_infra`, `docker_compose`, `kubernetes_config`, `monitoring_setup`
- **Specialized**: `smart_contract`, `security_audit`, `api_integration`, `performance_optimization`
- **Personal**: `personal_finance`, `habit_tracker`, `fitness_tracker`, `personal_wiki`
- **Education**: `study_notes`, `flashcard_deck`, `exam_prep`, `teaching_materials`
- **Art/Design**: `brand_identity`, `animation_project`
- **Events**: `event_planning`, `community_management`, `hackathon`, `workshop`, `conference_talk`
- **Health**: `meditation_app`, `mental_health`, `healthcare_app`
- **Legal**: `policy_framework`, `risk_assessment`, `incident_response`
- **Creative**: `worldbuilding`, `tabletop_rpg`
- **Environment**: `carbon_tracker`, `sustainability_report`

### Phase 3: Remaining Templates (125 templates)
Lower priority, niche use cases - add based on user demand.

---

## Cross-Reference: Agents by Project Category

| Agent | Web | Backend | Mobile | Desktop | Extensions | Bots | Libraries | Data/AI | Content | Business | DevOps | Specialized | Personal | Education | Art/Design | Events | Health | Legal | Creative | Environment |
|-------|-----|---------|--------|---------|------------|------|-----------|---------|---------|----------|--------|-------------|----------|-----------|------------|--------|--------|-------|----------|-------------|
| code-reviewer | X | X | X | X | X | X | X | X | | | X | X | X | X | | | X | X | | X |
| editor | | | | | | | | | X | X | | | X | X | X | X | X | X | X | X |
| researcher | | | | | | | | X | X | X | | | | X | | | | | X | X |
| security-reviewer | X | X | | | X | | | | | | X | X | X | | | | X | X | | |
| api-designer | | X | | | | | X | | | | | | | | | | | | | |
| ml-reviewer | | | | | | | | X | | | | | | | | | | | | |
| prompt-engineer | | | | | | | | X | | | | | | | | | | | | |
| technical-reviewer | X | X | | | | | X | | X | | | | | X | | | | | | |
| docs-reviewer | X | | | | | | X | | X | | | | | | | | | | | |
| devops-reviewer | | | | | | | | | | | X | | | | | | | | | |
| ux-reviewer | X | | X | X | | | | | | | | | X | X | X | | X | | | |
| designer | | | | | | | | | | | | | | | X | | | | | |
| curriculum-designer | | | | | | | | | X | | | | | X | | X | | | | |
| compliance-reviewer | | | | | | | | | | | | | | | | | X | X | | |
| project-planner | | | | | | | | | | X | | | | | | X | | | | |
| data-reviewer | | | | | | | | X | | | | | | | | | | | | X |

---

## Cross-Reference: Commands by Project Category

| Command | Web | Backend | Mobile | Desktop | Extensions | Bots | Libraries | Data/AI | Content | Business | DevOps | Specialized | Personal | Education | Art/Design | Events | Health | Legal | Creative | Environment |
|---------|-----|---------|--------|---------|------------|------|-----------|---------|---------|----------|--------|-------------|----------|-----------|------------|--------|--------|-------|----------|-------------|
| /review | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| /test | X | X | X | X | X | X | X | X | | | X | X | X | X | | | X | | | |
| /plan | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| /build | X | X | X | X | X | | X | X | | | X | X | X | | | | X | | | |
| /deploy | X | X | X | X | X | | | X | | | X | | | | | | | | | |
| /document | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| /analyze | | | | | | | | X | | X | X | X | X | | | | X | X | | X |
| /edit | | | | | | | | | X | X | | | X | X | X | X | X | X | X | X |
| /research | | | | | | | | X | X | X | | | | X | | | | | X | X |
| /outline | | | | | | | | | X | X | | | | X | X | X | | | X | |
| /security | X | X | | | X | | | | | | X | X | X | | | | X | X | | |
| /audit | | | | | | | | | | | | | | | | | | X | | X |
| /track | | | | | | | | | | | | | X | X | | | X | | | X |

---

## Notes for Template Development

1. **Start minimal**: Begin with essential configuration, expand based on feedback
2. **Framework variants**: Consider sub-templates for popular frameworks (React vs Vue vs Svelte)
3. **Experience levels**: Templates should work for beginners and experts
4. **Customization points**: Clearly mark what users should customize
5. **Examples**: Include concrete examples in each template
6. **Testing**: Each template should be tested with actual OpenCode usage
7. **Cross-pollination**: Many projects combine types (e.g., SaaS + AI Agent)

---

## Statistics

| Metric | Count |
|--------|-------|
| Total Project Types | 254 |
| High Priority | ~30 |
| Medium Priority | ~75 |
| Low Priority | ~149 |
| Categories | 20 |
| Unique Tags | ~200 |
| Recommended Agents | ~35 |

---

## Changelog

| Date | Change |
|------|--------|
| 2024-12-13 | Initial catalog with 60 project types |
| 2024-12-13 | Expanded to 200 project types across 12 categories |
| 2024-12-14 | Added 8 new categories: Personal & Lifestyle, Education & Learning, Art & Design, Events & Communities, Health & Wellness, Environment & Sustainability, Legal & Compliance, Creative Non-Code |
| 2024-12-14 | Expanded to 254 project types across 20 categories |
