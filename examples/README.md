# Example files

- `assetic-assets.csv`: an asset export in the shape Assetic's full asset CSV export can produce (the header labels are set in the export's configuration file). Five rows: two water mains and a stormwater main that land in the demo classes, a kerb and channel row whose class is not in the demo (it is skipped unless you pass `--create-classes`), and a row with a condition score outside 1 to 5, which is reported, not loaded.

```bash
npm run assets -- import assetic --assets=examples/assetic-assets.csv --dry-run
```
