# Browser Store Listing Draft

Target: `0.1.0-rc.1`

This is copy for the Chrome Web Store and Microsoft Edge Add-ons dashboards.
It must be rechecked against the exact uploaded artifact. LingoFlow handles
website content even though it has no developer-operated backend; dashboard
answers must not claim that it handles no user data.

Status: final engineering gates passed and the candidate is ready for an
approved tag and GitHub prerelease. No Chrome Web Store or Microsoft Edge
Add-ons submission has been made.

## Identity

- **Name:** LingoFlow
- **Category:** Productivity
- **Primary locale:** English
- **Supported UI locale:** Simplified Chinese
- **Short description:** Translate web pages inline with local-first provider controls.
- **Single purpose:** Translate user-selected web page text and display the
  translation inline beside the original content.

The short description is also the manifest description and remains below the
132-character Chrome limit.

## Detailed description — English

LingoFlow translates readable web page text and places the translation inline
beside the original content, so you can keep the page's structure and context
while reading.

Choose experimental Google Translate Free for a quick start, connect Azure
Translator, or use an OpenAI-compatible service such as OpenAI, a compatible
hosted API, Ollama, or LM Studio. Provider settings, site rules, terminology,
and cached translations stay in the browser profile. LingoFlow has no
developer-operated translation backend, analytics, tracking, or advertising.

When you start a translation, the selected page text, language instructions,
and matching terminology are sent to the translation provider you chose.
Provider credentials are sent only to that endpoint for authentication.
OpenAI-compatible requests also include the current page URL and domain as
translation context; Azure and Google requests do not add that context field.
Google Translate Free is experimental and sends source text to
translate.googleapis.com. Review the selected provider's privacy terms before
translating sensitive content.

Features include inline bilingual display modes, stop and failed-item retry for
long translations, pointer-sentence translation, dynamic translation for newly
visible content, local terminology lists, per-site reading rules,
compatibility diagnostics, and local cache controls.

LingoFlow cannot run on browser-internal pages, extension-store pages, or other
protected pages. Open Shadow DOM is supported; cross-origin iframe content is
not translated.

## Detailed description — Simplified Chinese

LingoFlow 会将网页中的可读文字翻译后直接显示在原文旁边，让你在保留页面结构和上下文的同时进行双语阅读。

你可以使用实验性的 Google Translate Free 快速开始，也可以连接 Azure
Translator、OpenAI 兼容服务、Ollama 或 LM Studio。Provider 配置、站点规则、术语和翻译缓存都保存在浏览器配置中。LingoFlow
没有开发者运营的翻译后端，不包含分析、追踪或广告。

当你主动开始翻译时，所选网页文字、语言指令和匹配的术语会发送到你选择的翻译服务；Provider
凭据只会用于向该端点进行身份验证。OpenAI 兼容请求还会把当前页面 URL 和域名作为翻译上下文发送；Azure 和 Google
请求不会附加这个上下文字段。Google Translate Free 属于实验性功能，会把原文发送到
translate.googleapis.com。翻译敏感内容前，请先查看所选服务的隐私条款。

主要功能包括：原文／双语／译文显示模式、停止长文翻译并仅重试失败项目、指针单句翻译、对后续出现内容的动态翻译、本地术语表、站点阅读规则、兼容性诊断和本地缓存管理。

浏览器内部页面、扩展商店页面及其他受保护页面无法使用扩展。支持开放的 Shadow DOM，但不会翻译跨来源 iframe 中的内容。

## Permissions justification

| Permission or host | Dashboard justification |
|---|---|
| `activeTab` | Access the active page only after the user invokes LingoFlow, so readable text can be collected and translations can be displayed inline. |
| `scripting` | Inject the isolated translation content script into the active page when the user starts translation or page-rule capture. |
| `storage` | Store provider settings and credentials, language preferences, site rules, terminology, onboarding progress, and translation cache in the browser profile. |
| Azure host | Send user-requested translation text to the built-in Azure Translator endpoint. |
| OpenAI host | Send user-requested translation text to the built-in OpenAI endpoint when that provider is selected. |
| Google host | Send user-requested translation text to experimental Google Translate Free when that provider is selected. |
| Optional HTTP/HTTPS hosts | Request only the exact custom-provider origin chosen by the user. These origins are optional and are not granted at installation. HTTP is intended for trusted local endpoints; remote endpoints should use HTTPS. |

## Remote-code declaration

**No.** All executable extension code is bundled in the submitted archive.
Translation-provider responses are processed as data and rendered as text.
LingoFlow does not download or execute remote JavaScript or WebAssembly.

## Data-handling disclosure

Declare all categories the dashboard presents that cover the following
behavior:

| Data handled | Local use | Transmission |
|---|---|---|
| Website content | Collect readable text for translation; cache source and translated text. | Sent to the provider selected by the user when translation is requested. |
| Browsing activity / page URL | Resolve site rules and retain URL/domain metadata in the local cache. | Current page URL/domain are sent as context in OpenAI-compatible requests. Azure and Google requests do not add that context field. Nothing is sent to a LingoFlow-operated service. |
| Authentication information | Store provider API keys or credentials in extension-local storage. | Sent only to the selected provider endpoint for authentication. |
| User-provided rules and terminology | Store, import, export, and apply locally. | Matching terminology can be included in a translation request to the selected provider. |
| Diagnostics | Hold current-page diagnostics in memory. | Not transmitted by LingoFlow. |

Certifications:

- Data is used only to provide user-requested translation and configuration.
- Data is not sold or used for advertising, creditworthiness, or lending.
- Data is not transferred to a LingoFlow-operated backend.
- Users initiate provider transmission by choosing a provider and starting or
  testing translation.
- Provider terms and privacy policies govern data after it reaches that
  provider.

## URLs

- **Privacy policy:** `https://github.com/hengistchan/lingo-flow/blob/main/docs/PRIVACY.md`
- **Project:** `https://github.com/hengistchan/lingo-flow`
- **Support:** `https://github.com/hengistchan/lingo-flow/issues`

The privacy URL must show the release's current policy before the package is
submitted. GitHub private vulnerability reporting is enabled at
<https://github.com/hengistchan/lingo-flow/security/advisories/new>; do not
direct sensitive reports to the public support URL.

## Assets

Existing packaged icon:

- `apps/extension/public/icons/lingoflow-icon-128.png`

Still required before submission:

- Chrome: at least one 1280×800 or 640×400 screenshot; up to five.
- Chrome: one 440×280 small promotional image.
- Edge: a square logo (300×300 recommended, 128×128 minimum).
- Edge: 440×280 small promotional tile.
- Edge screenshots are optional, up to six, at 1280×800 or 640×480.
- Optional 1400×560 marquee/large promotional artwork.

Use screenshots from the clean-profile release package, not development mode.
Recommended set:

1. A translated article showing inline bilingual output.
2. The reopened popup showing live/completed translation status.
3. Site-rule capture and compatibility review.
4. Provider and terminology settings.
5. Dynamic translation after revealing previously hidden content.

## Certification notes

LingoFlow has no test account. Google Translate Free can demonstrate the basic
flow without a key but is experimental and network-dependent. Reviewers can
also configure an endpoint they control.

Suggested path:

1. Install the extension and finish or skip onboarding.
2. Open a normal public article page.
3. Click the toolbar icon and start translation.
4. Reopen the toolbar popup to view status.
5. Open Settings to inspect provider, local-data, terminology, and site-rule
   controls.

Protected browser pages and extension-store pages cannot be translated by
design.
