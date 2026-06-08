# 00. Product Scope

## Product Name

**LingoFlow**

## Tagline

**AI-powered Translation for the Open Web**

## Positioning

LingoFlow is an open-source browser extension for bilingual web reading.

It is not primarily a translation service. It is a local-first browser-side translation runtime that lets users bring their own translation provider.

## Product Principles

1. **Local-first**  
   Settings, cache, and runtime state should be local unless the user explicitly chooses a provider.

2. **BYOK: Bring Your Own Key**  
   Users configure their own Azure Translator, OpenAI-compatible, or future provider API keys.

3. **Provider-agnostic**  
   The system must support machine translation providers, LLM providers, and custom HTTP providers.

4. **Low-permission first**  
   The MVP should use `activeTab`, `scripting`, and `storage`. It should not request `<all_urls>` by default.

5. **Web reading first**  
   MVP only solves webpage bilingual reading.

## MVP Scope

MVP must support:

- Chrome/Edge MV3 extension
- WXT + Vue 3 + TypeScript
- Popup UI
- Options UI
- User-configured Azure Translator
- User-configured OpenAI-compatible provider
- DOM text block collection
- Translation batch scheduling
- Translation cache
- Translation rendering below original text
- Clear translations
- Cache cleanup

## MVP Non-goals

Do not implement:

- PDF translation
- video subtitle translation
- image OCR
- comic translation
- cloud sync
- account system
- glossary
- selection translation
- input box translation
- all-site automatic translation
- provider marketplace
