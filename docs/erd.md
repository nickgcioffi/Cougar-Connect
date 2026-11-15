-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.User (
  userID bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  firstName text NOT NULL,
  lastName text NOT NULL,
  uniName text NOT NULL,
  gradDate date NOT NULL,
  biography text,
  photoURL text,
  authUserID uuid UNIQUE,
  studyLevel text NOT NULL DEFAULT 'Undergraduate'::text,
  launchPreference text NOT NULL DEFAULT 'Home'::text,
  role text NOT NULL DEFAULT 'user'::text CHECK (role = ANY (ARRAY['user'::text, 'organization_admin'::text, 'operator'::text])),
  CONSTRAINT User_pkey PRIMARY KEY (userID),
  CONSTRAINT User_authUserID_fkey FOREIGN KEY (authUserID) REFERENCES auth.users(id)
);
CREATE TABLE public.User Interests (
  interestID bigint NOT NULL,
  UserID bigint NOT NULL,
  CONSTRAINT User Interests_pkey PRIMARY KEY (interestID, UserID),
  CONSTRAINT User Interests_interestID_fkey FOREIGN KEY (interestID) REFERENCES public.Interest(interestID),
  CONSTRAINT User Interests_UserID_fkey FOREIGN KEY (UserID) REFERENCES public.User(userID)
);
CREATE TABLE public.Interest (
  interestID bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  CONSTRAINT Interest_pkey PRIMARY KEY (interestID)
);
CREATE TABLE public.Organization (
  orgID bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  orgName text NOT NULL,
  CONSTRAINT Organization_pkey PRIMARY KEY (orgID)
);
CREATE TABLE public.Events (
  eventID bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  time time without time zone NOT NULL,
  location text NOT NULL,
  description text,
  date date NOT NULL,
  orgID bigint NOT NULL,
  endTime time without time zone,
  CONSTRAINT Events_pkey PRIMARY KEY (eventID),
  CONSTRAINT Events_orgID_fkey FOREIGN KEY (orgID) REFERENCES public.Organization(orgID)
);
CREATE TABLE public.Event Interests (
  interestID bigint NOT NULL,
  eventID bigint NOT NULL,
  CONSTRAINT Event Interests_pkey PRIMARY KEY (interestID, eventID),
  CONSTRAINT Event Interests_interestID_fkey FOREIGN KEY (interestID) REFERENCES public.Interest(interestID),
  CONSTRAINT Event Interests_eventID_fkey FOREIGN KEY (eventID) REFERENCES public.Events(eventID)
);
CREATE TABLE public.UserEvents (
  userID bigint NOT NULL,
  eventID bigint NOT NULL,
  isSaved boolean NOT NULL DEFAULT false,
  CONSTRAINT UserEvents_pkey PRIMARY KEY (userID, eventID),
  CONSTRAINT UserEvents_userID_fkey FOREIGN KEY (userID) REFERENCES public.User(userID),
  CONSTRAINT UserEvents_eventID_fkey FOREIGN KEY (eventID) REFERENCES public.Events(eventID)
);
CREATE TABLE public.Event Co-Hosts (
  orgID bigint NOT NULL,
  eventID bigint NOT NULL,
  CONSTRAINT Event Co-Hosts_pkey PRIMARY KEY (orgID, eventID),
  CONSTRAINT Event Co-Hosts_orgID_fkey FOREIGN KEY (orgID) REFERENCES public.Organization(orgID),
  CONSTRAINT Event Co-Hosts_eventID_fkey FOREIGN KEY (eventID) REFERENCES public.Events(eventID)
);
CREATE TABLE public.Organization Admins (
  authUserID uuid NOT NULL,
  orgID bigint NOT NULL,
  CONSTRAINT Organization Admins_pkey PRIMARY KEY (authUserID, orgID),
  CONSTRAINT Organization Admins_authUserID_fkey FOREIGN KEY (authUserID) REFERENCES auth.users(id),
  CONSTRAINT Organization Admins_orgID_fkey FOREIGN KEY (orgID) REFERENCES public.Organization(orgID)
);
CREATE TABLE public.Organization Access Requests (
  requestID bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  firstName text NOT NULL,
  lastName text NOT NULL,
  email text NOT NULL,
  organization text NOT NULL,
  position text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'Pending'::text CHECK (status = ANY (ARRAY['Pending'::text, 'Needs Review'::text, 'Approved'::text, 'Rejected'::text])),
  reviewedBy uuid,
  createdAt timestamp with time zone NOT NULL DEFAULT now(),
  authUserID uuid,
  orgID bigint,
  aiRecommendation text,
  aiRationale text,
  reviewedAt timestamp with time zone,
  CONSTRAINT Organization Access Requests_pkey PRIMARY KEY (requestID),
  CONSTRAINT Organization Access Requests_authUserID_fkey FOREIGN KEY (authUserID) REFERENCES auth.users(id),
  CONSTRAINT Organization Access Requests_orgID_fkey FOREIGN KEY (orgID) REFERENCES public.Organization(orgID),
  CONSTRAINT Organization Access Requests_reviewedBy_fkey FOREIGN KEY (reviewedBy) REFERENCES auth.users(id)
);
CREATE TABLE public.Event Reviews (
  reviewID bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  eventID bigint NOT NULL,
  authUserID uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (char_length(comment) <= 1000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT Event Reviews_pkey PRIMARY KEY (reviewID),
  CONSTRAINT Event Reviews_eventID_fkey FOREIGN KEY (eventID) REFERENCES public.Events(eventID),
  CONSTRAINT Event Reviews_authUserID_fkey FOREIGN KEY (authUserID) REFERENCES auth.users(id)
);