; p, and p implies q, yet not q.
(declare-const p Bool)
(declare-const q Bool)
(assert p)
(assert (=> p q))
(assert (not q))
(check-sat)
