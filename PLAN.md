# Pass the host experience on iframe embeds

The Experience Builder widget sends the host experience URL as the embed query parameter `experience`. Audiom joins folder-page text onto features after that. This repository does not join, fetch experience config, or add a sidebar.

## Customer outcome

On an ArcGIS Online or Portal experience, a Standalone or Legacy Audiom iframe embed includes `experience=https://experience.arcgis.com/experience/{itemId}`. Bundled mode is unchanged. A Developer Edition app id, a missing app id, or a downloaded app sends no `experience` parameter.

## In scope

1. A pure function that returns that URL only when the app id is 32 hexadecimal characters. Any other value returns nothing.
2. `audiomConfigToEmbedConfig` sets `additionalParams.experience` when that URL is passed. `AudiomEmbedConfig` already copies `additionalParams` onto the query string.
3. Both iframe callers pass it: the runtime embed in `widget.tsx`, and the settings preview in `setting.tsx`. Read `appId` from the Jimu app store. On ArcGIS Online and Portal that value is the item id.
4. Unit tests for the URL function and for the embed query including or omitting `experience`.
5. A changelog fragment for the new embed parameter. The join itself stays in Audiom-Front-End.

## Out of scope

- A sidebar, a spreadsheet field, or a call to `attachColumns`.
- Fetching `/content/items/{id}/data` from this widget.
- Bundled mode. It does not build an embed URL and has no object card.
- Enterprise portal hosts other than the ArcGIS Online experience URL. Audiom's parser accepts a path containing `experience/` and a 32-character id, and the unmerged join fetches that id from ArcGIS Online.
