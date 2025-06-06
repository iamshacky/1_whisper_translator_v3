# C:\xampp\htdocs\project_1_individual_backups\1_whisper_translator_v6.01__06-04_at_0949pm__sqlite__save_and_view_added

## ✅ Core Fixes and Features

- Full voice-to-voice and text-to-text translation pipeline is working.
- Moderator suggestions and language warnings unified across both audio and text input.
- Accept button and "Did you mean..." messages work as intended.
- Manual and auto language modes tested successfully.
- System survives edge case sequences like: Preview > Send > Accept > Re-Preview.
- Advanced Settings Panel works (voice prompts, warning toggles).
- Mobile (Android) and desktop cross-device tested via WebSocket.
- Preview UI properly updates with feedback from moderator and language detection.
- Language labels added 05/29/2025. Example: `en → de`. 

## 🔧 Tech Details

- Deployed via Railway:  
  https://1whispertranslatorv3-production.up.railway.app/?room=warehouse
- Localhost testing:  
  http://localhost:3000/?room=warehouse

## 📂 Notes

- Sqlite added.
- Saves message to room_id=<room_id> in messages table each time one is sent.
- Displays saved messages. (You have to be in the room, ex: room_id=warehouse).
- That's it.

## Next plan
- Add more CRUD stuff.
---

Backed up from `C:\xampp\htdocs\project1\1_whisper_translator_v3`  
into: C:\xampp\htdocs\project_1_individual_backups\1_whisper_translator_v6.01__06-04_at_0949pm__sqlite__save_and_view_added

