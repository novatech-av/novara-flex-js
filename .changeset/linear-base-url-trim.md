---
"novara-flex-js": patch
---

Trimming trailing slashes from `baseUrl` now runs in linear time, so a long run of `/` in the URL can no longer make the client constructor slow. Behavior is unchanged: every trailing `/` is still removed.
