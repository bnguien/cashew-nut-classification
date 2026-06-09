from django.contrib.auth.hashers import make_password
from rest_framework import serializers

from .models import AppUser, UserRole


class AdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ["id", "username", "role", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AdminUserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, max_length=128)
    role = serializers.ChoiceField(choices=UserRole.choices)

    class Meta:
        model = AppUser
        fields = ["username", "password", "role", "is_active"]

    def create(self, validated_data):
        raw_password = validated_data.pop("password")
        validated_data["password"] = make_password(raw_password)
        return AppUser.objects.create(**validated_data)


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, max_length=128, required=False)
    role = serializers.ChoiceField(choices=UserRole.choices, required=False)

    class Meta:
        model = AppUser
        fields = ["username", "password", "role", "is_active"]

    def update(self, instance, validated_data):
        raw_password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if raw_password:
            instance.password = make_password(raw_password)
        instance.save()
        return instance
