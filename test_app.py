import unittest
from datetime import date
from app import app, db, Retailer, Transaction, build_report_data

class LedgerAppTestCase(unittest.TestCase):
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

    def _login(self):
        with self.client.session_transaction() as sess:
            sess['authed'] = True

    def test_bill_entry_and_balance(self):
        self._login()
        with app.app_context():
            r = Retailer(name="Test Retailer", has_santhoor=True, has_mtr=True)
            db.session.add(r)
            db.session.commit()
            r_id = r.id

            self.assertEqual(r.balance("santhoor"), 0.0)

            # Bill entry (purchase)
            res1 = self.client.post('/api/transactions', json={
                'retailer_id': r_id,
                'book': 'santhoor',
                'type': 'purchase',
                'amount': 2500.50,
                'date': '2026-09-15'
            })
            self.assertEqual(res1.status_code, 200)

            # Payment entry
            res2 = self.client.post('/api/transactions', json={
                'retailer_id': r_id,
                'book': 'santhoor',
                'type': 'payment',
                'amount': 1000.00,
                'date': '2026-09-18'
            })
            self.assertEqual(res2.status_code, 200)

            db_r = db.session.get(Retailer, r_id)
            self.assertEqual(db_r.balance('santhoor'), 1500.50)

    def test_sequential_bill_numbers(self):
        self._login()
        with app.app_context():
            r = Retailer(name="Apex Traders", has_santhoor=True, has_mtr=True)
            db.session.add(r)
            db.session.commit()
            r_id = r.id

            # Add 3 bill entries chronologically
            self.client.post('/api/transactions', json={'retailer_id': r_id, 'book': 'santhoor', 'type': 'purchase', 'amount': 500, 'date': '2026-09-10'})
            self.client.post('/api/transactions', json={'retailer_id': r_id, 'book': 'santhoor', 'type': 'purchase', 'amount': 750, 'date': '2026-09-12'})
            self.client.post('/api/transactions', json={'retailer_id': r_id, 'book': 'santhoor', 'type': 'purchase', 'amount': 1200, 'date': '2026-09-15'})

            db_r = db.session.get(Retailer, r_id)
            hist = db_r.history('santhoor')
            self.assertEqual(len(hist), 3)
            # Latest bill is Bill #3
            self.assertEqual(hist[0]['bill_number'], 3)
            self.assertEqual(hist[1]['bill_number'], 2)
            self.assertEqual(hist[2]['bill_number'], 1)

            # Report check
            report = build_report_data('santhoor', from_str='2026-09-01', to_str='2026-09-30')
            row = report['rows'][0]
            self.assertIn('Bill #1', row['debit_date'])
            self.assertIn('Bill #2', row['debit_date'])
            self.assertIn('Bill #3', row['debit_date'])

    def test_clear_and_restore_history(self):
        self._login()
        with app.app_context():
            r = Retailer(name="Ganesh Shop", has_santhoor=True, has_mtr=True)
            db.session.add(r)
            db.session.commit()
            r_id = r.id

            self.client.post('/api/transactions', json={'retailer_id': r_id, 'book': 'santhoor', 'type': 'purchase', 'amount': 3000, 'date': '2026-09-10'})
            self.client.post('/api/transactions', json={'retailer_id': r_id, 'book': 'santhoor', 'type': 'payment', 'amount': 1000, 'date': '2026-09-11'})

            db_r = db.session.get(Retailer, r_id)
            self.assertEqual(db_r.balance('santhoor'), 2000.00)
            self.assertEqual(len(db_r.history('santhoor')), 2)

            # Clear history (soft delete)
            clear_res = self.client.post(f'/api/retailers/{r_id}/clear?book=santhoor')
            self.assertEqual(clear_res.status_code, 200)
            c_data = clear_res.get_json()
            self.assertTrue(c_data['ok'])
            self.assertEqual(c_data['balance'], 0.0)

            db_r_cleared = db.session.get(Retailer, r_id)
            self.assertEqual(db_r_cleared.balance('santhoor'), 0.0)
            self.assertEqual(len(db_r_cleared.history('santhoor')), 0)
            self.assertTrue(db_r_cleared.has_archived('santhoor'))

            # Restore history
            restore_res = self.client.post(f'/api/retailers/{r_id}/restore?book=santhoor')
            self.assertEqual(restore_res.status_code, 200)

            db_r_restored = db.session.get(Retailer, r_id)
            self.assertEqual(db_r_restored.balance('santhoor'), 2000.00)
            self.assertEqual(len(db_r_restored.history('santhoor')), 2)

    def test_excel_export_attachment_header(self):
        self._login()
        res = self.client.get('/api/reports/excel?book=santhoor&from=2026-09-01&to=2026-09-30')
        self.assertEqual(res.status_code, 200)
        cd = res.headers.get('Content-Disposition', '')
        self.assertIn('attachment', cd)
        self.assertIn('.xlsx', cd)

if __name__ == '__main__':
    unittest.main()
