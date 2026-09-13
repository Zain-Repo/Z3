# Compare image models

Add a prompt card in ZImage and write one shared brief. Connect its output to two or more image
cards. Select a different model on each card, or duplicate a configured card and change its model.
Duplication keeps the incoming connections. Arrange the cards side by side.

Each image card keeps its own aspect ratio, image count, quality, creative direction, and other
supported settings. Connect the same reference image to each model that accepts image references.
Use the same seed only when the models support it; equal seeds do not guarantee comparable outputs
across model families.

**Run canvas** generates the cards using the current connected brief. It also runs other generation
cards on the board, in dependency order. To rerun only one model, use that card's **Generate image**
button. Up to two cards run at once, with additional cards queued. Each request is billed separately.

Results appear on their cards as they finish. Failed models leave successful results intact.
**Stop after current** stops scheduling new work while allowing submitted requests to finish.
Select an output beneath a card to choose the image passed to its downstream connections.

Remove a card to remove it from the comparison, or disconnect its prompt input in the selected
card's Connections panel. Generated assets remain in the library. The board saves on this device;
export the workflow to transfer its layout and settings.
