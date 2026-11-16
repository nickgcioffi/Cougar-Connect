
-- 011: Student feedback about Cougar Connect
-- Each authenticated user can submit one app review.

CREATE TABLE IF NOT EXISTS public."App Reviews" (
    "reviewID" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "authUserID" UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    "rating" INTEGER NOT NULL
        CHECK ("rating" BETWEEN 1 AND 5),
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("authUserID")
);

ALTER TABLE public."App Reviews"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can submit their own app reviews"
ON public."App Reviews";

CREATE POLICY "Students can submit their own app reviews"
ON public."App Reviews"
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = "authUserID");

DROP POLICY IF EXISTS "Students can read their own app reviews"
ON public."App Reviews";

CREATE POLICY "Students can read their own app reviews"
ON public."App Reviews"
FOR SELECT TO authenticated
USING (auth.uid() = "authUserID");

GRANT SELECT, INSERT ON public."App Reviews" TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public."App Reviews_reviewID_seq"
TO authenticated;
