# 1_whisper_translator_v9.04__07-25

1_whisper_translator_v9.04__07-25_at_1116pm__time_to_start_deletion_module_refinement

### Updates

- Option to save a room url they visit to localStorage. A room needs atleast 1 message in it before it can be shared.

- QR codes get generated when saving a shared room.

### Next 

- Refine modules/persistence_sqlite/delete
- Per-message expiration. Automatically delete at a set time from when the timestamp says they were created.
```
// modules\persistence_sqlite\delete\server\model.js

export async function deleteExpiredMessagesForAllRooms() {
  ...
localStorage["room-owners"] = {
  "room-xyz": "user_abc"
}
...
}
```

### Notes and considerations

#### Restrict who can delete rooms or all messages. 
1. The room creater could be determined by localStorage. 
  - What if they cleared their localStorage? Logging in and sending a message populates localStorage again.
  - What if they forget their login after deleting a room? Then they or noone else can delete that room. 
    - Maybe that's it may be worth considering a feature where if a room isn't used by anyone for a certain amount of time, the room automatically gets deleted.
 