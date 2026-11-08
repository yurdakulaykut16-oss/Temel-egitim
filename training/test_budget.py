import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import budget
class BudgetTests(unittest.TestCase):
 def test_counts_local_and_reserved_and_limits(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);data=root/'data';data.mkdir();(data/'file').write_bytes(b'12345');ledger=data/'models.json';ledger.write_text(json.dumps([{'bytes':10}]))
   with patch.object(budget,'ROOT',root),patch.object(budget,'DATA',data),patch.object(budget,'LEDGER',ledger),patch.object(budget,'LIMIT_BYTES',100):
    result=budget.usage();self.assertEqual(result['models_reserved'],10);self.assertEqual(result['generated'],5+ledger.stat().st_size)
    budget.require_headroom(1)
    with self.assertRaisesRegex(ValueError,'100 GB'):budget.require_headroom(100)
if __name__=='__main__':unittest.main()
