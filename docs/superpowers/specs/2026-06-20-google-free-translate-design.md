# Google Free Translate Provider Design

## Goal

Add a selectable no-key Google Translate provider for users who want a free machine-translation option.

## Design

Add a built-in provider preset named `google-free-translate`. It has no user-editable fields and is considered configured by default. It calls the public Google web translation endpoint at `https://translate.googleapis.com/translate_a/single` with `client=gtx`, `dt=t`, source language, target language, and one query string per text.

The provider is not the default provider. Users must choose it in settings. The extension manifest will add the narrow host permission `https://translate.googleapis.com/*`; no broad permissions are added.

Because this is not Google Cloud Translation, it has no API key, SLA, quota controls, or billing integration. Failures should degrade through the existing provider error handling.

## Testing

- Unit test URL/query construction and nested Google response parsing.
- Unit test no-key provider connection behavior.
- Unit test settings defaults and configured summary.
- E2E preview test that the provider appears in settings.
- Build/manifest test that the production manifest has only the narrow Google host permission.

