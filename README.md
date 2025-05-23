
## 🧠 Whisper Translator – v4.05 (Backup @ 05-23, 3:41am)

### ✅ Recently Added Features

- **Manual Input Language Override**  
  Users can now select a specific language they are speaking, instead of relying on auto-detect.  
  Great for short utterances or ambiguous phrases where language detection might fail.

- **Settings Panel Updates**  
  UI now reflects the manual vs auto language selection clearly, with new dropdowns:
  - Input Language Mode: `Auto` or `Manual`
  - Manual Input Language: (only shown when Manual mode is selected)

- **Code Cleanup + Modularization**  
  Replaced old inline WebSocket handler in `index.js` with modular `setupWebSocket()` from `wsHandler.js`, allowing future scalability (e.g., rooms, per-client settings).

---

### 🧪 About to Be Added (After This Backup)

- **Language Code Labels (e.g. `en → de`)**  
  Each message will display a code indicating what language it was translated from and to.  
  Useful for debugging and verifying assumptions in multilingual conversations.

- **Future Label Visibility Toggle (Planned)**  
  Once per-device output language is added, these labels may become misleading or redundant.  
  Will add an option in the upcoming Main Settings section to hide/show these labels.

- **Per-Device Output Language Support (Next Feature)**  
  Each client will be able to receive messages in their own preferred language, regardless of the speaker’s selected target language.
