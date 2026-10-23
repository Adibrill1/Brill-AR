# AssimpJS converter

Version0.0.10 from npm (package assimpjs). Source repository https://github.com/kovacsv/assimpjs. Registry record inspected: https://registry.npmjs.org/assimpjs/0.0.10.

Package integrity: sha512-iY8M+eQzdCvfSkdduj6sPmIbP2fIn40PK6JRrAMxBawL3tHG6Mm0qvitkxB3ZoFBug5o7IdbzQK+jujZTopGPQ==

Bundled wrapper MIT and Assimp BSD notices are retained in this directory. One local wrapper modification: getHeapMax() reduced from2GB to256MB to bound WASM heap growth. This does not bound all JS allocations or guarantee a process RSS ceiling. Worker terminated after30s or after completion.20MB source/result caps. No public claim of complete FBX fidelity, embedded animation, or texture coverage.
