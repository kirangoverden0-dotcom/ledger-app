from datetime import datetime
from zoneinfo import ZoneInfo
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

BOOKS = ("santhoor", "mtr")
IST = ZoneInfo("Asia/Kolkata")


def now_ist():
    # Stored as a naive datetime but computed from IST wall-clock time, so
    # "today" always matches the business's actual local day regardless of
    # which timezone the server (e.g. Render, usually UTC) runs in.
    return datetime.now(IST).replace(tzinfo=None)


class Retailer(db.Model):
    __tablename__ = "retailers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)

    transactions = db.relationship(
        "Transaction", backref="retailer", cascade="all, delete-orphan"
    )

    def balance(self, book):
        purchases = sum(
            t.amount for t in self.transactions if t.book == book and t.type == "purchase"
        )
        payments = sum(
            t.amount for t in self.transactions if t.book == book and t.type == "payment"
        )
        return round(purchases - payments, 2)

    def history(self, book):
        items = sorted(
            (t for t in self.transactions if t.book == book),
            key=lambda t: t.created_at,
            reverse=True,
        )
        return [t.to_dict() for t in items]

    def to_summary_dict(self, book):
        return {"id": self.id, "name": self.name, "balance": self.balance(book)}

    def payments_by_date(self, book):
        """Sum of payments received, grouped by calendar date (IST).
        Returns {'YYYY-MM-DD': amount}. Purchases are not included --
        this mirrors the paper ledger's date columns, which record what
        each retailer paid on that date, not what they bought."""
        out = {}
        for t in self.transactions:
            if t.book != book or t.type != "payment":
                continue
            key = t.created_at.date().isoformat()
            out[key] = out.get(key, 0) + t.amount
        return out


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.Integer, primary_key=True)
    retailer_id = db.Column(db.Integer, db.ForeignKey("retailers.id"), nullable=False)
    book = db.Column(db.String(20), nullable=False)  # 'santhoor' | 'mtr'
    type = db.Column(db.String(20), nullable=False)  # 'purchase' | 'payment'
    amount = db.Column(db.Float, nullable=False)
    note = db.Column(db.String(200), default="")
    created_at = db.Column(db.DateTime, default=now_ist)

    def to_dict(self):
        return {
            "id": self.id,
            "book": self.book,
            "type": self.type,
            "amount": self.amount,
            "note": self.note,
            "date": self.created_at.strftime("%d %b %Y"),
            "created_at": self.created_at.isoformat(),
        }
