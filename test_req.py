import asyncio
import httpx
async def main():
    async with httpx.AsyncClient() as client:
        # Assuming we need auth, let us just hit the /api/chat/threads endpoint to see if it requires auth
        pass

if __name__ == "__main__":
    asyncio.run(main())
