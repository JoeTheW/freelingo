"""Add is_sandbox column to study_plans for on-demand lessons.

Revision ID: 0053_sandbox_plan
Revises: 0052_exercise_corrections
"""
import sqlalchemy as sa

from alembic import op

revision = "0053_sandbox_plan"
down_revision = "0052_exercise_corrections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_plans",
        sa.Column("is_sandbox", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("study_plans", "is_sandbox")