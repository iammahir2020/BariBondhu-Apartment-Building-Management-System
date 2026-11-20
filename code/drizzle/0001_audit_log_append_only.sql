-- Audit log entries cannot be edited or deleted (NFR-27). Written by hand: drizzle-kit doesn't make triggers.
CREATE FUNCTION "public"."audit_logs_refuse_change"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries cannot be edited or deleted (NFR-27)';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "public"."audit_logs"
FOR EACH ROW EXECUTE FUNCTION "public"."audit_logs_refuse_change"();--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_truncate"
BEFORE TRUNCATE ON "public"."audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "public"."audit_logs_refuse_change"();
