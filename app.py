import os
from datetime import date, timedelta
from functools import wraps

from flask import Flask, jsonify, request, session, send_from_directory
from models import db, Retailer, Transaction, BOOKS

app = Flask(__name__, static_folder="static", static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

db_url = os.environ.get("DATABASE_URL", "sqlite:///ledger.db")
# Render/Heroku-style postgres URLs sometimes start with postgres:// which
# SQLAlchemy 1.4+ no longer accepts — normalize it.
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
with app.app_context():
    db.create_all()

LEDGER_PIN = os.environ.get("LEDGER_PIN", "1234")


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("authed"):
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)

    return wrapper


def valid_book(book):
    return book in BOOKS


# ---------------- Auth ----------------


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    if str(data.get("pin", "")) == str(LEDGER_PIN):
        session["authed"] = True
        session.permanent = True
        return jsonify({"ok": True})
    return jsonify({"error": "wrong pin"}), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/session")
def session_check():
    return jsonify({"authed": bool(session.get("authed"))})


# ---------------- Summary ----------------


@app.route("/api/summary")
@login_required
def summary():
    out = {}
    for book in BOOKS:
        retailers = Retailer.query.all()
        total = round(sum(r.balance(book) for r in retailers), 2)
        out[book] = {"total": total, "count": len(retailers)}
    return jsonify(out)


# ---------------- Retailers ----------------


@app.route("/api/retailers")
@login_required
def list_retailers():
    book = request.args.get("book", "santhoor")
    if not valid_book(book):
        return jsonify({"error": "invalid book"}), 400
    retailers = Retailer.query.order_by(Retailer.name.asc()).all()
    return jsonify([r.to_summary_dict(book) for r in retailers])


@app.route("/api/retailers", methods=["POST"])
@login_required
def create_retailer():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400

    r = Retailer(name=name)
    db.session.add(r)
    db.session.flush()  # get r.id before commit

    for book in BOOKS:
        opening = data.get(f"opening_{book}")
        if opening:
            try:
                amt = float(opening)
            except (TypeError, ValueError):
                amt = 0
            if amt > 0:
                db.session.add(
                    Transaction(
                        retailer_id=r.id,
                        book=book,
                        type="purchase",
                        amount=amt,
                        note="Opening balance",
                    )
                )
    db.session.commit()
    return jsonify({"id": r.id, "name": r.name})


@app.route("/api/retailers/<int:retailer_id>")
@login_required
def get_retailer(retailer_id):
    book = request.args.get("book", "santhoor")
    if not valid_book(book):
        return jsonify({"error": "invalid book"}), 400
    r = Retailer.query.get_or_404(retailer_id)
    return jsonify(
        {
            "id": r.id,
            "name": r.name,
            "balance": r.balance(book),
            "history": r.history(book),
        }
    )


@app.route("/api/retailers/<int:retailer_id>", methods=["DELETE"])
@login_required
def delete_retailer(retailer_id):
    r = Retailer.query.get_or_404(retailer_id)
    db.session.delete(r)
    db.session.commit()
    return jsonify({"ok": True})


# ---------------- Transactions ----------------


@app.route("/api/transactions", methods=["POST"])
@login_required
def create_transaction():
    data = request.get_json(silent=True) or {}
    retailer_id = data.get("retailer_id")
    book = data.get("book")
    ttype = data.get("type")
    amount = data.get("amount")

    if not valid_book(book):
        return jsonify({"error": "invalid book"}), 400
    if ttype not in ("purchase", "payment"):
        return jsonify({"error": "invalid type"}), 400
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid amount"}), 400
    if amount <= 0:
        return jsonify({"error": "amount must be positive"}), 400

    r = Retailer.query.get_or_404(retailer_id)
    t = Transaction(retailer_id=r.id, book=book, type=ttype, amount=amount)
    db.session.add(t)
    db.session.commit()
    return jsonify({"ok": True, "balance": r.balance(book)})


# ---------------- Date-wise grid (for print) ----------------


@app.route("/api/grid")
@login_required
def grid():
    book = request.args.get("book", "santhoor")
    if not valid_book(book):
        return jsonify({"error": "invalid book"}), 400

    today = date.today()
    default_from = today - timedelta(days=6)
    from_str = request.args.get("from", default_from.isoformat())
    to_str = request.args.get("to", today.isoformat())
    try:
        d_from = date.fromisoformat(from_str)
        d_to = date.fromisoformat(to_str)
    except ValueError:
        return jsonify({"error": "invalid date"}), 400
    if d_from > d_to:
        d_from, d_to = d_to, d_from
    if (d_to - d_from).days > 45:
        return jsonify({"error": "range too large, max 45 days"}), 400

    dates = []
    d = d_from
    while d <= d_to:
        dates.append(d.isoformat())
        d += timedelta(days=1)

    retailers = Retailer.query.order_by(Retailer.name.asc()).all()
    rows = []
    for r in retailers:
        by_date = r.payments_by_date(book)
        entries = {ds: by_date.get(ds, 0) for ds in dates}
        rows.append({"id": r.id, "name": r.name, "balance": r.balance(book), "entries": entries})

    return jsonify({"dates": dates, "rows": rows})


# ---------------- Frontend ----------------


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
