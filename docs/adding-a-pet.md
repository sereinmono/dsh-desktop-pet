# Adding a Pet

English | [中文](adding-a-pet.zh.md)

This guide explains how to add a new desktop pet to **dsh-desktop-pet**.

A pet is a directory containing a manifest (`pet.json`) and a sprite sheet
(`spritesheet.webp` or `spritesheet.png`). The plugin scans two places at
startup and lists every discovered pet in the settings picker:

- **User pets directory** (`~/.dsh/desktop-pet/pets/<id>/`) — where pets you
  import from a folder or from Petdex live. This is the normal way to add a
  pet; imported pets survive plugin upgrades because they live outside the
  installed package.
- **Bundled pets directory** (`assets/pets/<id>/` inside the installed
  package) — pets shipped with the plugin itself. End users normally never
  write here: the directory is owned by the package and is replaced on every
  upgrade.

When a pet id exists in both places, the user directory wins.

## The easy way: use the settings card

Open **Settings → Plugins → Plugin configuration → Desktop pet**. The card has
two import buttons:

- **Add from folder** — pick any directory on disk that already contains a
  pet (`pet.json` + sprite sheet). The plugin validates it, copies it into the
  user pets directory, and switches to it.
- **Add from Petdex** — enter a Petdex slug; the plugin runs
  `npx petdex install <slug>` (a third-party community CLI), then imports the
  downloaded directory into the user pets directory.

## Adding a pet manually

Each method below has a **copy-paste prompt** for a coding agent, followed by
**manual steps** you can follow yourself. All manual methods end with copying
a pet directory into the **user pets directory** — not into the plugin's
`assets/pets/`.

### 1. Using hatch-pet

**Prompt:**

```text
Run the hatch-pet skill to generate a pet, then copy the generated directory
(pet.json + spritesheet.webp) into ~/.dsh/desktop-pet/pets/<id>/ and restart
the plugin so it appears in the settings pet picker.
```

**Manual steps:**

1. Run the hatch-pet skill inside Codex (or a coding agent that ships it). The
   generated directory lands in `~/.codex/pets/<name>/` and already contains
   `pet.json` + `spritesheet.webp`.
2. Copy that directory into `~/.dsh/desktop-pet/pets/<id>/`.
3. Restart the plugin (restart Harness, or reload the plugin).
4. Open **Settings → Plugins → Plugin configuration → Desktop pet** and pick the
   new pet from the dropdown.

### 2. Importing an existing folder

**Prompt:**

```text
Copy the existing directory <source-dir> (containing pet.json and
spritesheet.webp) into ~/.dsh/desktop-pet/pets/<id>/, then restart the plugin
so it appears in the settings pet picker.
```

**Manual steps:**

1. Make sure `<source-dir>` contains `pet.json` and `spritesheet.webp` (or `.png`).
2. Copy it into `~/.dsh/desktop-pet/pets/<id>/`. The directory name is the pet id.
3. Restart the plugin.
4. Pick the new pet from the settings dropdown.

### 3. Using the Petdex community

**Prompt:**

```text
Run "npx petdex install <slug>" to download a community pet, then copy the
downloaded directory into ~/.dsh/desktop-pet/pets/<slug>/ and restart the
plugin so it appears in the pet picker.
```

**Manual steps:**

1. Run `npx petdex install <slug>`. Petdex is a third-party community; the pet
   downloads into `~/.petdex/pets/<slug>/` (older versions used
   `~/.codex/pets/<slug>/`).
2. Copy that directory into `~/.dsh/desktop-pet/pets/<slug>/`.
3. Restart the plugin.
4. Pick the new pet from the settings dropdown.

## Pet directory structure

```text
~/.dsh/desktop-pet/pets/<pet-id>/
├── pet.json          # manifest (id / displayName / description / spritesheetPath)
└── spritesheet.webp  # sprite sheet (lossless WebP or PNG)
```

> **Placeholders**
> - `~/.dsh` — the per-user data directory shared with the rest of the plugin.
> - `<pet-id>` / `<id>` / `<slug>` — the pet directory name (used as the pet id in the picker).
> - `<source-dir>` — an existing directory that already contains the two files.

## Asset format reference

> Most users never create these files by hand — the tools above already produce
> a directory in this format. This section is a reference for verifying or
> hand-authoring an asset pack.

### `pet.json`

Four fields:

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A short sentence describing the pet.",
  "spritesheetPath": "spritesheet.webp"
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Identifier field. The settings picker uses the **directory name** as the pet id. |
| `displayName` | yes | Label shown in the settings pet picker. |
| `description` | optional | Human description. |
| `spritesheetPath` | yes | File name of the sprite sheet inside the same directory. |

### Sprite sheet

| Property | Value |
|---|---|
| Format | lossless WebP (preferred) or PNG |
| Size | **1536 × 1872** px |
| Grid | **8 columns × 9 rows** |
| Cell | **192 × 208** px |
| Background | transparent |
| Unused cells | fully transparent |

Animation rows are fixed, in this exact order (row 0 at the top):

| Row | State | Frames |
|---|---|---|
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

Frames are laid out row-major, left to right: frame `i` of row `r` occupies the
cell at `x = i * 192`, `y = r * 208`.

## Notes

- Imported pets live in the **user pets directory** (`~/.dsh/desktop-pet/pets/`).
  Never edit the plugin's bundled `assets/pets/` for your own pets — it is
  replaced on every plugin upgrade and would lose your work.
- The pet is rendered with the fixed 9-state animation format; a sprite sheet
  narrower than 1536 px or shorter than 1872 px fails to load with a clear error
  in the log.
- A broken pet directory is skipped during scanning; the remaining pets still
  load, and the plugin falls back to the bundled `text` pet if nothing valid is
  found.
- The bundled `text` pet is intentionally the only shipped pet. It renders each
  state as a distinct colour and label, which is useful for verifying that the
  pet's appearance follows the harness task state.
