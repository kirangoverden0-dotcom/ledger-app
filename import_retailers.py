import json
import os
import re
import sys

# Ensure local imports work properly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db, Retailer, Transaction


def normalize_name(name):
    """Normalize string for duplicate checking:
    - Removes extra inner/outer whitespace
    - Strips trailing/leading punctuation like commas
    - Converts to lowercase
    """
    if not name:
        return ""
    cleaned = name.strip().strip(",.;:")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.lower()


def import_retailers(json_file_path="retailer_names.json", reset_db=False):
    """Reads JSON file containing retailer names and creates Retailer records.
    Logs every single entry being checked.
    """
    if not os.path.exists(json_file_path):
        parent_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", json_file_path
        )
        if os.path.exists(parent_path):
            json_file_path = parent_path
        else:
            print(f"Error: File '{json_file_path}' not found.")
            return

    print(f"Reading JSON file: {json_file_path}")
    try:
        with open(json_file_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
    except Exception as e:
        print(f"Error reading JSON file '{json_file_path}': {e}")
        return

    if isinstance(raw_data, list):
        raw_count = len(raw_data)
        raw_items = raw_data
    elif isinstance(raw_data, dict):
        raw_items = (
            raw_data.get("retailers")
            or raw_data.get("names")
            or raw_data.get("data")
            or []
        )
        raw_count = len(raw_items)
    else:
        raw_count = 0
        raw_items = []

    print(f"\n=======================================================")
    print(f"RAW COUNT LOADED FROM JSON: {raw_count} items")
    print(f"=======================================================\n")

    names = []
    for item in raw_items:
        if isinstance(item, str):
            cleaned = item.strip().strip(",.;:")
            cleaned = re.sub(r"\s+", " ", cleaned)
            if cleaned:
                names.append(cleaned)
        elif isinstance(item, dict) and "name" in item:
            cleaned = str(item["name"]).strip().strip(",.;:")
            cleaned = re.sub(r"\s+", " ", cleaned)
            if cleaned:
                names.append(cleaned)

    with app.app_context():
        db.create_all()

        if reset_db:
            print("(--reset flag specified: Clearing existing retailers...)")
            Transaction.query.delete()
            Retailer.query.delete()
            db.session.commit()

        existing_retailers = Retailer.query.all()
        existing_map = {
            normalize_name(r.name): r.name for r in existing_retailers
        }

        added = []
        skipped = []

        print("--- INDIVIDUAL LOG FOR EACH RETAILER ENTRY ---")
        for idx, name in enumerate(names, 1):
            norm = normalize_name(name)
            if not norm:
                print(f"[{idx:3d}/{len(names)}] '{name}' -> SKIPPED (Empty/Invalid)")
                continue

            if norm in existing_map:
                existing_match = existing_map[norm]
                skipped.append((name, existing_match))
                print(
                    f"[{idx:3d}/{len(names)}] '{name}' -> SKIPPED (Duplicate of existing: '{existing_match}')"
                )
            else:
                existing_map[norm] = name
                new_retailer = Retailer(
                    name=name,
                    has_santhoor=True,
                    has_mtr=True,
                )
                db.session.add(new_retailer)
                added.append(name)
                print(f"[{idx:3d}/{len(names)}] '{name}' -> ADDED")

        db.session.commit()

        print("\n" + "=" * 60)
        print("              RETAILER IMPORT SUMMARY")
        print("=" * 60)
        print(f" Total Entries Loaded from JSON:  {raw_count}")
        print(f" Valid Non-Empty Names Extracted: {len(names)}")
        print(f" Successfully Added to DB:         {len(added)}")
        print(f" Skipped Duplicates:               {len(skipped)}")
        print("=" * 60)


if __name__ == "__main__":
    reset = "--reset" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--reset"]
    target_file = args[0] if args else "retailer_names.json"
    import_retailers(target_file, reset_db=reset)
