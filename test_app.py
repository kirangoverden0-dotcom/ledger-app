import unittest
from datetime import date
from app import app, db, Retailer, Transaction, build_report_data

class LedgerBillTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        with app.app_context():
            db.drop_all()
            db.create_all()
        self.client = app.test_client()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def test_bill_entry_and_balance(self):
        with app.app_context():
            # 1. Create a retailer
            r = Retailer(name="Test Retailer", has_santhoor=True, has_mtr=True)
            db.session.add(r)
            db.session.commit()
            r_id = r.id

            # Initial balance should be 0.0
            self.assertEqual(r.balance("santhoor"), 0.0)

            # 2. Add Bill entry (Purchase transaction)
            with self.client.session_transaction() as sess:
                sess['authed'] = True

            response = self.client.post('/api/transactions', json={
                'retailer_id': r_id,
                'book': 'santhoor',
                'type': 'purchase',
                'amount': 2500.50,
                'date': '2026-09-15'
            })
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertTrue(data.get('ok'))
            self.assertEqual(data.get('balance'), 2500.50)

            # 3. Add Collection entry (Payment transaction)
            response2 = self.client.post('/api/transactions', json={
                'retailer_id': r_id,
                'book': 'santhoor',
                'type': 'payment',
                'amount': 1000.00,
                'date': '2026-09-18'
            })
            self.assertEqual(response2.status_code, 200)
            data2 = response2.get_json()
            self.assertEqual(data2.get('balance'), 1500.50)

            # 4. Verify running balance calculation (billed minus collected)
            db_r = Retailer.query.get(r_id)
            self.assertEqual(db_r.balance('santhoor'), 1500.50)

            # 5. Verify Report data includes the bill entry under debit
            report = build_report_data('santhoor', from_str='2026-09-01', to_str='2026-09-30')
            rows = report['rows']
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertEqual(row['name'], 'Test Retailer')
            self.assertEqual(row['debit_amount'], 2500.50)
            self.assertEqual(row['debit_date'], '15 Sep')
            self.assertEqual(row['credit_amount'], 1000.00)
            self.assertEqual(row['credit_date'], '18 Sep')
            self.assertEqual(row['balance'], 1500.50)

if __name__ == '__main__':
    unittest.main()
