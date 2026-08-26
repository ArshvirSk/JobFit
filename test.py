
import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        print("Sending POST request to create thread...")
        # create a new thread to skip auth (well, we might need auth)
        pass

