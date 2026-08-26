
import asyncio
from backend.chat.graph import chat_pipeline

async def main():
    print("Testing chat pipeline...")
    try:
        pipeline_input = {
            "user_id": "test_user",
            "user_message": "Tell me about Razorpay",
            "chat_history": [],
            "detected_entities": [],
            "detection_method": None,
            "quota_exceeded": None,
            "response_text": None,
            "response_type": None,
            "company_data": {},
        }
        
        async for step in chat_pipeline.astream(pipeline_input, stream_mode="updates"):
            print("STEP UPDATE:", step.keys())
    except Exception as e:
        print("EXCEPTION:", e)

if __name__ == "__main__":
    asyncio.run(main())

