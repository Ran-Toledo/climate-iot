import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.sqlite import configure_sqlite

engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
configure_sqlite(engine.sync_engine)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        yield session
