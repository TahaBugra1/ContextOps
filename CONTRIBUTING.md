# Contributing to ContextOps

First off, thank you for considering contributing to ContextOps! It's people like you that make open source such a great community to learn, inspire, and create.

## Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check our [Issues](https://github.com/yutronax/contextops/issues) page to see if someone else has already created a ticket. If not, go ahead and [make one](https://github.com/yutronax/contextops/issues/new)!

## Setting up your local environment

1. **Fork the repository** to your own GitHub account and clone it to your local machine:
   ```bash
   git clone https://github.com/yutronax/contextops.git
   cd contextops
   ```

2. **Install dependencies:**
   ContextOps uses Jest for unit testing. Make sure you have Node.js installed, then run:
   ```bash
   npm install
   ```

3. **Load the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `contextops` folder.

## Making Changes

1. Create a new branch for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes in the codebase.
   * **Note:** ContextOps uses a strict "Zero-DOM-Conflict" philosophy. Avoid direct `innerHTML` modifications or heavy `setInterval` polling that could lock up the browser's Main Thread.

## Running Tests

Before submitting a Pull Request, please ensure all unit tests pass. We use Jest to test the core background and content script logic.

```bash
npx jest
```
*(If you added new functionality, please add corresponding tests in the `tests/unit/` folder.)*

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
2. Open a Pull Request from your fork to the `main` branch of the original ContextOps repository.
3. In your PR description, clearly explain the problem you've solved or the feature you've added.
4. Wait for a review! We'll do our best to review your code promptly.

## Code of Conduct

By participating in this project, you agree to abide by a standard Open Source Code of Conduct. Please be respectful and constructive in issues and pull request reviews.

Thank you for helping make ContextOps better!
