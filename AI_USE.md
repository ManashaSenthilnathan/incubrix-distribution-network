# AI tool disclosure

- OpenAI ChatGPT (GPT-6): used to help interpret the assessment brief, suggest implementation changes, draft/modify TypeScript code and tests, and prepare project documentation and submission wording.
- No external generative AI API or model is called by the running service.
- No AI-generated media is included. The code marks `aiGenerated` content in rule checks and includes that flag in the output manifest.
- Human review and local test execution are still required. The available environment could not install npm dependencies or run the Express service, so the project must not be described as fully verified.
