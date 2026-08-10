# Trusted Automation contract

This module owns the orchestration contract only. Existing Executive Function services remain authoritative for their domain behavior:

- Brain Dump owns extraction and transient-session behavior.
- Task Clarification owns decomposition and clarification behavior.
- Next Best Action owns ranking.
- Adaptive Daily Capacity owns capacity calculation.
- Daily Executive Brief owns planning and summary generation.
- Schedule Repair owns repair scoring and task mutation.
- Recovery Mode owns backlog classification and restart selection.

Trusted Automation may invoke those services through stable contracts and domain events, but it must not duplicate their algorithms or write their task data directly. High-impact task mutations are intentionally absent from the bounded MVP rule catalog.
