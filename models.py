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


class Setting(db.Model):
    __tablename__ = "settings"
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(255), nullable=False)


class Retailer(db.Model):
    __tablename__ = "retailers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    has_santhoor = db.Column(db.Boolean, default=True, nullable=False)
    has_mtr = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)

    transactions = db.relationship(
        "Transaction", backref="retailer", cascade="all, delete-orphan"
    )

    def is_in_book(self, book):
        if book == "santhoor":
            return self.has_santhoor
        elif book == "mtr":
            return self.has_mtr
        return False

    def balance(self, book, date_to=None):
        if date_to:
            if isinstance(date_to, str):
                from datetime import date as d_type
                date_to = d_type.fromisoformat(date_to)
            purchases = sum(
                t.amount for t in self.transactions
                if t.book == book and t.type == "purchase" and not t.is_archived and t.created_at.date() <= date_to
            )
            payments = sum(
                t.amount for t in self.transactions
                if t.book == book and t.type == "payment" and not t.is_archived and t.created_at.date() <= date_to
            )
        else:
            purchases = sum(
                t.amount for t in self.transactions if t.book == book and t.type == "purchase" and not t.is_archived
            )
            payments = sum(
                t.amount for t in self.transactions if t.book == book and t.type == "payment" and not t.is_archived
            )
        return round(purchases - payments, 2)

    def history(self, book):
        active_txs = [t for t in self.transactions if t.book == book and not t.is_archived]
        # Chronological sort to compute sequential bill numbers per book
        purchases_chrono = sorted(
            [t for t in active_txs if t.type == "purchase"],
            key=lambda t: (t.created_at, t.id)
        )
        bill_num_map = {t.id: idx + 1 for idx, t in enumerate(purchases_chrono)}

        items = sorted(
            active_txs,
            key=lambda t: (t.created_at, t.id),
            reverse=True,
        )
        out = []
        for t in items:
            d = t.to_dict()
            if t.type == "purchase":
                d["bill_number"] = bill_num_map.get(t.id)
            out.append(d)
        return out

    def has_archived(self, book=None):
        if book:
            return any(t.is_archived for t in self.transactions if t.book == book)
        return any(t.is_archived for t in self.transactions)

    def to_summary_dict(self, book):
        return {
            "id": self.id,
            "name": self.name,
            "has_santhoor": self.has_santhoor,
            "has_mtr": self.has_mtr,
            "balance": self.balance(book),
            "has_archived": self.has_archived(book),
        }

    def payments_by_date(self, book, date_from=None, date_to=None):
        """Sum of payments received, grouped by calendar date (IST).
        Returns {'YYYY-MM-DD': amount}."""
        if isinstance(date_from, str):
            from datetime import date as d_type
            date_from = d_type.fromisoformat(date_from)
        if isinstance(date_to, str):
            from datetime import date as d_type
            date_to = d_type.fromisoformat(date_to)

        out = {}
        for t in self.transactions:
            if t.book != book or t.type != "payment" or t.is_archived:
                continue
            t_date = t.created_at.date()
            if date_from and t_date < date_from:
                continue
            if date_to and t_date > date_to:
                continue
            key = t_date.isoformat()
            out[key] = round(out.get(key, 0) + t.amount, 2)
        return out


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.Integer, primary_key=True)
    retailer_id = db.Column(db.Integer, db.ForeignKey("retailers.id"), nullable=False)
    book = db.Column(db.String(20), nullable=False)  # 'santhoor' | 'mtr'
    type = db.Column(db.String(20), nullable=False)  # 'purchase' | 'payment'
    amount = db.Column(db.Float, nullable=False)
    note = db.Column(db.String(200), default="")
    is_archived = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)

    def to_dict(self):
        return {
            "id": self.id,
            "book": self.book,
            "type": self.type,
            "amount": self.amount,
            "note": self.note,
            "is_archived": self.is_archived,
            "date": self.created_at.strftime("%d %b %Y"),
            "created_at": self.created_at.isoformat(),
        }

